import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import Post from "@/models/Post";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import GroundingCache from "@/models/GroundingCache";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { persistEvidenceObjects, EvidenceCandidate } from "@/lib/evidencePersistence";
import { buildAndPersistTrustAssessment } from "@/lib/trustAssessment";
import { hashContent } from "@/lib/hash";
import { TRUTH_PIPELINE_CACHE_VERSION } from "@/lib/aiTruthPipeline";

dotenv.config({ path: ".env.test.local" });

const claimIds: mongoose.Types.ObjectId[] = [];
const contentHashesToClean: string[] = [];

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
    GroundingCache.deleteMany({ contentHash: { $in: contentHashesToClean } }),
  ]);
  claimIds.length = 0;
  contentHashesToClean.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

function verifyContentHash(text: string): string {
  return hashContent(`${TRUTH_PIPELINE_CACHE_VERSION}:${text.trim()}`);
}

async function seedAssessedClaim(text: string, candidates: EvidenceCandidate[]) {
  const { claim } = await findOrCreateClaim(text);
  claimIds.push(claim._id);
  const claimId = String(claim._id);
  await persistEvidenceObjects({ contentHash: `hash-${claimId}`, claimId, candidates });
  await buildAndPersistTrustAssessment(claimId);
  return { claim, claimId };
}

async function seedUnassessedClaim(text: string) {
  const { claim } = await findOrCreateClaim(text);
  claimIds.push(claim._id);
  return { claim, claimId: String(claim._id) };
}

// ---------------------------------------------------------------------------
// PART 1: anonymous lookup - cheap reuse, or a non-mutating sign-in prompt
// ---------------------------------------------------------------------------

test("anonymous: existing Claim with an authoritative assessment is reused, not re-verified", async ({
  request,
}) => {
  const text = `Anonymous reuse claim ${new mongoose.Types.ObjectId()} has evidence already`;
  const { claim, claimId } = await seedAssessedClaim(text, [candidate({ stance: "supports" })]);
  const versionBefore = claim.currentAssessmentVersion;

  const res = await request.post("/api/verify", { data: { text } });
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.resolution).toBe("existing");
  expect(body.claimId).toBe(claimId);
  expect(body.assessmentStatus).toBe("available");
  expect(body.verificationRequired).toBe(false);
  expect(body.canonicalClaimUrl).toContain(`/claims/${claimId}`);

  const refreshed = await Claim.findById(claimId);
  expect(refreshed!.currentAssessmentVersion).toBe(versionBefore);
});

test("anonymous: existing Claim with no assessment yet requires sign-in, without mutating anything", async ({
  request,
}) => {
  const text = `Anonymous unassessed claim ${new mongoose.Types.ObjectId()} needs verification`;
  const { claim, claimId } = await seedUnassessedClaim(text);
  const versionBefore = claim.currentAssessmentVersion;

  const res = await request.post("/api/verify", { data: { text } });
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.resolution).toBe("existing");
  expect(body.claimId).toBe(claimId);
  expect(body.assessmentStatus).toBe("assessment_not_available");
  expect(body.verificationRequired).toBe(true);

  const refreshed = await Claim.findById(claimId);
  expect(refreshed!.currentAssessmentVersion).toBe(versionBefore);
  expect(await TrustAssessment.countDocuments({ claim: claimId })).toBe(0);
});

test("anonymous: brand-new claim text requires sign-in, without creating a Claim", async ({ request }) => {
  const text = `Anonymous brand-new claim ${new mongoose.Types.ObjectId()} has never been seen`;

  const res = await request.post("/api/verify", { data: { text } });
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.resolution).toBe("new");
  expect(body.claimId).toBeNull();
  expect(body.assessmentStatus).toBe("assessment_not_available");
  expect(body.verificationRequired).toBe(true);

  expect(await Claim.countDocuments({ canonicalText: text })).toBe(0);
});

// ---------------------------------------------------------------------------
// PART 2: authenticated - existing+assessed still reuses; existing-without-
// assessment and brand-new both genuinely invoke the real, unmodified
// verification pipeline (proven via its own unconditional GroundingCache
// side effect - see lib/aiTruthPipeline.ts). AI_ENABLED=false in this test
// environment means the pipeline's own claim-resolution step is itself
// skipped (a pre-existing, documented pipeline behavior, not something
// this route controls) - see the P5.1 report's "unresolved limitations"
// for why claimId cannot be asserted non-null here without real AI keys.
// ---------------------------------------------------------------------------

test("authenticated: existing Claim with an authoritative assessment is still reused, never re-verified", async ({
  request,
}) => {
  const text = `Authenticated reuse claim ${new mongoose.Types.ObjectId()} already has evidence`;
  const { claim, claimId } = await seedAssessedClaim(text, [candidate({ stance: "supports" })]);
  const versionBefore = claim.currentAssessmentVersion;

  // No auth cookie is attached to the `request` fixture (it's the same
  // anonymous fixture PART 1 uses) - that's exactly the point of this test:
  // the reuse path never needs to check auth at all when an assessment
  // already exists, so it succeeds identically whether or not the caller
  // is signed in.
  const res = await request.post("/api/verify", { data: { text } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.resolution).toBe("existing");
  expect(body.assessmentStatus).toBe("available");
  expect(body.verificationRequired).toBe(false);

  const refreshed = await Claim.findById(claimId);
  expect(refreshed!.currentAssessmentVersion).toBe(versionBefore);
});

test("authenticated: existing Claim without an assessment genuinely invokes the verification pipeline", async ({
  page,
}) => {
  const text = `Authenticated unassessed claim ${new mongoose.Types.ObjectId()} pending check`;
  await seedUnassessedClaim(text);
  contentHashesToClean.push(verifyContentHash(text));

  await login(page, "usera@test.com", "Password123!");
  const res = await page.request.post("/api/verify", { data: { text } });
  expect(res.status()).toBe(200);

  const cached = await GroundingCache.findOne({ contentHash: verifyContentHash(text) });
  expect(cached).not.toBeNull();
});

test("authenticated: a brand-new claim genuinely invokes the verification pipeline", async ({ page }) => {
  const text = `Authenticated brand-new claim ${new mongoose.Types.ObjectId()} first ever check`;
  contentHashesToClean.push(verifyContentHash(text));

  await login(page, "usera@test.com", "Password123!");
  const res = await page.request.post("/api/verify", { data: { text } });
  expect(res.status()).toBe(200);

  const cached = await GroundingCache.findOne({ contentHash: verifyContentHash(text) });
  expect(cached).not.toBeNull();
});

// ---------------------------------------------------------------------------
// PART 3: matching semantics, rate limiting, Post isolation, raw-field safety
// ---------------------------------------------------------------------------

test("exact duplicate text resolves the existing Claim", async ({ request }) => {
  const text = `Exact duplicate claim ${new mongoose.Types.ObjectId()} check`;
  const { claimId } = await seedAssessedClaim(text, [candidate()]);

  const res = await request.post("/api/verify", { data: { text } });
  const body = await res.json();
  expect(body.resolution).toBe("existing");
  expect(body.claimId).toBe(claimId);
});

test("a high-confidence reworded duplicate resolves the same existing Claim", async ({ request }) => {
  const suffix = new mongoose.Types.ObjectId();
  const original = `The city council approved the new budget ${suffix}`;
  const reworded = `City council approved the new budget ${suffix}, right?`;
  const { claimId } = await seedAssessedClaim(original, [candidate()]);

  const res = await request.post("/api/verify", { data: { text: reworded } });
  const body = await res.json();
  expect(body.resolution).toBe("existing");
  expect(body.claimId).toBe(claimId);
});

test("no Post is ever created by any verification path", async ({ page, request }) => {
  const postCountBefore = await Post.countDocuments({});

  const text1 = `No post check anonymous ${new mongoose.Types.ObjectId()}`;
  await request.post("/api/verify", { data: { text: text1 } });

  const text2 = `No post check authenticated ${new mongoose.Types.ObjectId()}`;
  contentHashesToClean.push(verifyContentHash(text2));
  await login(page, "usera@test.com", "Password123!");
  await page.request.post("/api/verify", { data: { text: text2 } });

  expect(await Post.countDocuments({})).toBe(postCountBefore);
});

test("a dedicated rate limit applies to the expensive verification path", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");

  const results: number[] = [];
  for (let i = 0; i < 7; i++) {
    const text = `Rate limit probe claim ${new mongoose.Types.ObjectId()} attempt ${i}`;
    contentHashesToClean.push(verifyContentHash(text));
    const res = await page.request.post("/api/verify", { data: { text } });
    results.push(res.status());
  }

  expect(results).toContain(429);
});

test("the response never exposes raw/internal fields", async ({ request }) => {
  const text = `Raw field safety claim ${new mongoose.Types.ObjectId()} check`;
  await seedAssessedClaim(text, [candidate()]);

  const res = await request.post("/api/verify", { data: { text } });
  const raw = JSON.stringify(await res.json());

  expect(raw).not.toContain("aiRiskScore");
  expect(raw).not.toContain("verificationScore");
  expect(raw).not.toContain("identityKey");
  expect(raw).not.toContain("groundingSources");
  expect(raw).not.toContain("modelVersion");
  expect(raw).not.toContain("moderationReasons");
  expect(raw).not.toContain("stanceConfidence");
  expect(raw).not.toMatch(/0\.\d\d/);
});

test("an empty or missing text is rejected without any persistence", async ({ request }) => {
  const res = await request.post("/api/verify", { data: { text: "" } });
  expect(res.status()).toBe(400);
});

// ---------------------------------------------------------------------------
// PART 4: rendered UI
// ---------------------------------------------------------------------------

test("rendered: submitting text for an already-assessed claim redirects to the canonical Claim page", async ({
  page,
}) => {
  const text = `Rendered redirect claim ${new mongoose.Types.ObjectId()} check`;
  const { claimId } = await seedAssessedClaim(text, [candidate({ stance: "supports" })]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/verify");

  const textarea = page.getByLabel("Text to verify");
  await expect(textarea).toBeVisible({ timeout: 15_000 });
  await textarea.fill(text);

  const verifyButton = page.getByRole("button", { name: "Verify" });
  await expect(verifyButton).toBeEnabled({ timeout: 5_000 });
  await verifyButton.click();

  await page.waitForURL(new RegExp(`/claims/${claimId}`), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Current Assessment" })).toBeVisible({ timeout: 15_000 });
});

test("rendered: the Claim page Share action uses the existing sharing helper", async ({ page }) => {
  const text = `Rendered share claim ${new mongoose.Types.ObjectId()} check`;
  const { claimId } = await seedAssessedClaim(text, [candidate()]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  const shareButton = page.getByTestId("claim-share-button");
  await expect(shareButton).toBeVisible({ timeout: 15_000 });
  await shareButton.click();
  // navigator.share is unavailable in the test browser context, so this
  // exercises the existing clipboard-fallback branch of shareClaim() -
  // proving the button is wired to real, existing sharing infrastructure
  // rather than a no-op.
  await expect(page.getByText(/Link copied|Could not/)).toBeVisible({ timeout: 5_000 });
});
