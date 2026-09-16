import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { persistEvidenceObjects, EvidenceCandidate } from "@/lib/evidencePersistence";
import { buildAndPersistTrustAssessment } from "@/lib/trustAssessment";

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

async function seedAssessedClaim(candidates: EvidenceCandidate[]) {
  const { claim } = await findOrCreateClaim(`Source transparency test claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);
  await persistEvidenceObjects({ contentHash: `hash-${claimId}`, claimId, candidates });
  const assessment = await buildAndPersistTrustAssessment(claimId);
  return { claim, claimId, assessment };
}

// ---------------------------------------------------------------------------
// PART 1: API - sourceType/publishedAt were already public; this just
// confirms they remain present and that nothing raw/internal leaks alongside
// them.
// ---------------------------------------------------------------------------

test("evidence items expose sourceType and publishedAt, and never raw internal scoring fields", async ({
  request,
}) => {
  const { claimId } = await seedAssessedClaim([
    candidate({
      stance: "supports",
      domain: "research.example.edu",
      sourceUrl: "https://research.example.edu/paper",
      publishedAt: new Date("2025-01-15"),
    }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  const res = await request.get(`/api/claims/${claimId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  const allEvidence = [...body.evidence.supporting, ...body.evidence.contradicting, ...body.evidence.context];
  expect(allEvidence.length).toBeGreaterThan(0);
  for (const item of allEvidence) {
    expect(item).toHaveProperty("sourceType");
    expect(item).toHaveProperty("publishedAt");
  }

  const raw = JSON.stringify(body.evidence);
  expect(raw).not.toContain("authorityScore");
  expect(raw).not.toContain("relevanceScore");
  expect(raw).not.toContain("stanceConfidence");
  expect(raw).not.toContain("independenceGroup");
  expect(raw).not.toContain("providerRunId");
});

test("all existing Claim API fields remain unchanged alongside evidence source metadata", async ({ request }) => {
  const { claimId } = await seedAssessedClaim([candidate()]);

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();
  expect(body.currentAssessment).not.toBeNull();
  expect(body.explanation).not.toBeNull();
  expect(body.history).toBeDefined();
  expect(body.relatedPosts).toBeDefined();
  expect(body.follow).toEqual({ isFollowing: false, followerCount: 0 });
  expect(body.communityContext).toBeDefined();
});

// ---------------------------------------------------------------------------
// PART 2: presentation - rendered on the Claim page
// ---------------------------------------------------------------------------

test("rendered: evidence cards show a neutral source-type label and an absolute publication date", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim([
    candidate({
      stance: "supports",
      domain: "research.example.edu",
      sourceUrl: "https://research.example.edu/paper",
      publishedAt: new Date("2025-01-15"),
    }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await page.getByRole("button", { name: /^Evidence$/i }).click();
  await expect(page.getByText("Academic source")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Jan 15, 2025")).toBeVisible();
});

test("rendered: Claim page never fabricates a Search confidence percentage (no groundingConfidence exists at Claim level)", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim([candidate({ stance: "supports" })]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await page.getByRole("button", { name: /^Evidence$/i }).click();
  const panel = page.locator("#claim-evidence-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText(/Search confidence/)).toHaveCount(0);
});

test("rendered: two sources sharing a domain are flagged as the same source domain, not asserted as fully non-independent", async ({ page }) => {
  const { claimId } = await seedAssessedClaim([
    candidate({ stance: "supports", domain: "shared-example.com" }),
    candidate({ stance: "supports", domain: "shared-example.com" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await page.getByRole("button", { name: /^Evidence$/i }).click();
  await expect(page.getByText("Same source domain as another citation").first()).toBeVisible({
    timeout: 15_000,
  });
});

test("rendered: no raw score, group-id, or trust/credibility wording ever appears in the Evidence section", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim([
    candidate({ stance: "supports", domain: "shared-example.com" }),
    candidate({ stance: "supports", domain: "shared-example.com" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await page.getByRole("button", { name: /^Evidence$/i }).click();
  const panel = page.locator("#claim-evidence-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const text = (await panel.innerText()).toLowerCase();
  expect(text).not.toMatch(/group-\d+/);
  expect(text).not.toContain("credibility score");
  expect(text).not.toContain("trust score");
  expect(text).not.toContain("authority");
  // The domain-based check can only prove a shared domain, never prove
  // independence - it must never claim more than that.
  expect(text).not.toContain("independent source");
  expect(text).not.toContain("not independent");
});

test("rendered: Evidence remains a separate section from Why this assessment", async ({ page }) => {
  const { claimId } = await seedAssessedClaim([
    candidate({ domain: "example.gov", sourceUrl: "https://example.gov/report" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: "Why this assessment" })).toBeVisible({ timeout: 15_000 });
  const explanationText = (await page.getByTestId("claim-explanation").innerText()).toLowerCase();
  expect(explanationText).not.toContain("government source");

  await page.getByRole("button", { name: /^Evidence$/i }).click();
  await expect(page.getByText("Government source")).toBeVisible();
});
