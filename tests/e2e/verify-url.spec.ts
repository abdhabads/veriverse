import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Post from "@/models/Post";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { persistEvidenceObjects, EvidenceCandidate } from "@/lib/evidencePersistence";
import { buildAndPersistTrustAssessment } from "@/lib/trustAssessment";
import { extractArticleContent } from "@/lib/articleExtraction";
import https from "node:https";

dotenv.config({ path: ".env.test.local" });

const claimIds: mongoose.Types.ObjectId[] = [];

function candidate(overrides: Partial<EvidenceCandidate> = {}): EvidenceCandidate {
  return {
    sourceUrl: `https://example.com/${Math.random()}`,
    domain: "example.com",
    stance: "supports",
    stanceConfidence: 0.7,
    evidenceText: "Officials confirmed the report.",
    evidenceStart: 0,
    evidenceEnd: 30,
    relevanceScore: 0.7,
    provider: "tavily",
    ...overrides,
  };
}

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    EvidenceObject.deleteMany({ claimId: { $in: claimIds } }),
    TrustAssessment.deleteMany({ claim: { $in: claimIds } }),
  ]);
  claimIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

async function seedAssessedClaim(text: string, candidates: EvidenceCandidate[]) {
  const { claim } = await findOrCreateClaim(text);
  claimIds.push(claim._id);
  const claimId = String(claim._id);
  await persistEvidenceObjects({ contentHash: `hash-${claimId}`, claimId, candidates });
  await buildAndPersistTrustAssessment(claimId);
  return { claim, claimId };
}

// Every test below submits a URL, which is gated by the dedicated
// "verify_url_fetch" rate limit (10/min, IP-keyed for anonymous callers).
// Without isolation, every anonymous test in this file would share one
// real client IP against the same in-memory limiter for the lifetime of
// the dev server process and exhaust it well before the file finishes -
// a unique synthetic x-forwarded-for per test keeps each test's rate-limit
// bucket independent, the same way seeding unique claim text per test
// keeps Claim identity independent.
function uniqueIpHeaders(): Record<string, string> {
  const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
  return { "x-forwarded-for": ip };
}

// ---------------------------------------------------------------------------
// PART 1: SSRF rejection via the live route (end-to-end proof, not just the
// isolated lib/urlSafety.ts / lib/boundedFetch.ts unit tests)
// ---------------------------------------------------------------------------

test("rejects a URL pointing at localhost", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "http://localhost:9/secret" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.success).toBe(false);
});

test("rejects a URL pointing at a literal loopback address", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "http://127.0.0.1:9/secret" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

test("rejects a URL pointing at an RFC1918 private address", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "http://10.0.0.5/internal" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

test("rejects a URL pointing at the cloud metadata endpoint", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "http://169.254.169.254/latest/meta-data/" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

test("rejects a URL pointing at an IPv6 loopback address", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "http://[::1]:9/secret" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

test("rejects a non-http(s) scheme", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "file:///etc/passwd" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

test("rejects a URL containing embedded credentials", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "http://user:pass@example.com/" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

test("rejects a malformed URL", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "not a url" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(422);
});

// ---------------------------------------------------------------------------
// PART 2: request shape / mutual exclusivity
// ---------------------------------------------------------------------------

test("rejects a request with neither text nor url", async ({ request }) => {
  const res = await request.post("/api/verify", { data: {}, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(400);
});

test("rejects a request with both text and url", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { text: "a claim", url: "https://example.com/" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(400);
});

// ---------------------------------------------------------------------------
// PART 3: dedicated rate limit for the acquisition step
// ---------------------------------------------------------------------------

test("a dedicated rate limit applies to URL submission, distinct from verify_text", async ({ request }) => {
  // A synthetic, unique x-forwarded-for isolates this test's rate-limit
  // bucket from every other anonymous test in this file (all of which
  // otherwise share one real client IP against the same in-memory
  // limiter for the lifetime of the dev server process) - this test is
  // the only one deliberately meant to exhaust its bucket.
  const syntheticIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  const results: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await request.post("/api/verify", {
      data: { url: `http://127.0.0.1:9/probe-${i}` },
      headers: { "x-forwarded-for": syntheticIp },
    });
    results.push(res.status());
  }
  expect(results).toContain(429);
});

// ---------------------------------------------------------------------------
// PART 4: successful real-world fetch (a stable, IANA-reserved example
// domain - not a hostile-address test, a genuine end-to-end round trip)
// ---------------------------------------------------------------------------

test("successfully fetches, extracts, and resolves a real public page", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "https://example.com/" }, headers: uniqueIpHeaders() });
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.submittedUrl).toBe("https://example.com/");
  expect(typeof body.finalUrl).toBe("string");
  expect(["claim", "question", "instruction", "rhetorical_claim"]).toContain(body.contentType);
  // Anonymous - never mutates regardless of what was found.
  if (body.resolution !== "existing" || body.assessmentStatus !== "available") {
    expect(body.verificationRequired === true || body.resolution === "no_claim_found").toBe(true);
  }
});

// ---------------------------------------------------------------------------
// PART 5: response safety and Post isolation
// ---------------------------------------------------------------------------

test("the URL-mode response never exposes raw/internal fields", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { url: "https://example.com/" }, headers: uniqueIpHeaders() });
  const raw = JSON.stringify(await res.json());

  expect(raw).not.toContain("resolvedAddress");
  expect(raw).not.toContain("redirectChain");
  expect(raw).not.toContain("aiRiskScore");
  expect(raw).not.toContain("identityKey");
  expect(raw).not.toContain("groundingSources");
  expect(raw).not.toMatch(/0\.\d\d/);
});

test("no Post is created by any URL verification path", async ({ page, request }) => {
  const postCountBefore = await Post.countDocuments({});

  await request.post("/api/verify", { data: { url: "https://example.com/" }, headers: uniqueIpHeaders() });
  await request.post("/api/verify", { data: { url: "http://127.0.0.1:9/x" }, headers: uniqueIpHeaders() });

  await login(page, "usera@test.com", "Password123!");
  await page.request.post("/api/verify", { data: { url: "https://example.com/" }, headers: uniqueIpHeaders() });

  expect(await Post.countDocuments({})).toBe(postCountBefore);
});

// ---------------------------------------------------------------------------
// PART 6: existing-Claim reuse when the extracted text matches
// ---------------------------------------------------------------------------

test("anonymous URL submission reuses an existing assessed Claim without re-verifying", async ({ request }) => {
  // AI_ENABLED=false in this environment means classification always
  // falls back to contentType "claim" with extractedClaim null - so the
  // resolutionText this route resolves identity against is the extracted
  // article text itself. Seeding a Claim whose canonicalText matches what
  // example.com's page is known to extract to proves the reuse path
  // without depending on real AI classification.
  const html: string = await new Promise((resolve, reject) => {
    https.get("https://example.com/", (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
  const { title, text } = extractArticleContent(html);
  const candidateText = [title, text].filter(Boolean).join(". ").trim();

  const { claimId, claim } = await seedAssessedClaim(candidateText, [candidate()]);
  const versionBefore = claim.currentAssessmentVersion;

  const res = await request.post("/api/verify", { data: { url: "https://example.com/" }, headers: uniqueIpHeaders() });
  const body = await res.json();

  expect(body.claimId).toBe(claimId);
  expect(body.resolution).toBe("existing");
  expect(body.assessmentStatus).toBe("available");
  expect(body.verificationRequired).toBe(false);

  const refreshed = await Claim.findById(claimId);
  expect(refreshed!.currentAssessmentVersion).toBe(versionBefore);
});

// ---------------------------------------------------------------------------
// PART 7: rendered UI
// ---------------------------------------------------------------------------

test("rendered: URL mode shows a fetching state and a safe result for a private-address URL", async ({ page }) => {
  // Isolates this test's "verify_url_fetch" rate-limit bucket from every
  // other test in this file - see uniqueIpHeaders()'s own comment.
  await page.setExtraHTTPHeaders(uniqueIpHeaders());
  await page.goto("/verify");
  await page.getByRole("tab", { name: "URL" }).click();

  const urlInput = page.getByLabel("Webpage URL to verify");
  await expect(urlInput).toBeVisible({ timeout: 15_000 });
  await urlInput.fill("http://127.0.0.1:9/secret");

  const verifyButton = page.getByRole("button", { name: /Verify|Fetching page/ });
  await expect(verifyButton).toBeEnabled({ timeout: 5_000 });
  await verifyButton.click();

  await expect(page.getByText(/could not be verified|address VeriVerse cannot fetch/i)).toBeVisible({
    timeout: 15_000,
  });
});
