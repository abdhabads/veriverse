import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import { findOrCreateClaim, advanceClaimAssessmentVersion } from "@/lib/claimIdentity";
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

// Builds a claim with two authoritative TrustAssessment versions: an
// insufficient_evidence v1 (no evidence at all), then a v2 with real
// supporting+contradicting evidence added - a genuine, provable band change
// plus a genuine, provable evidence addition, using the same production
// re-assessment flow (advanceClaimAssessmentVersion) rather than fabricating
// TrustAssessment rows directly.
async function seedClaimWithTwoVersions(text: string, v2Candidates: EvidenceCandidate[]) {
  const { claim } = await findOrCreateClaim(text);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  await buildAndPersistTrustAssessment(claimId); // v1: insufficient_evidence, no evidence

  await advanceClaimAssessmentVersion({ claimId, priorEvidence: [] }); // bump to v2
  await persistEvidenceObjects({ contentHash: `hash-${claimId}-v2`, claimId, candidates: v2Candidates });
  await buildAndPersistTrustAssessment(claimId); // v2

  return { claim, claimId };
}

// ---------------------------------------------------------------------------
// PART 1: API - history/current change shape, safety, no engine leakage
// ---------------------------------------------------------------------------

test("current assessment and the newest history row both carry a well-shaped, safe change narrative", async ({
  request,
}) => {
  const { claimId } = await seedClaimWithTwoVersions(`Change narrative claim ${new mongoose.Types.ObjectId()}`, [
    candidate({ stance: "supports" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  const res = await request.get(`/api/claims/${claimId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.currentAssessment.version).toBe(2);
  expect(body.currentAssessment.change).not.toBeNull();
  expect(body.currentAssessment.change.fromVersion).toBe(1);
  expect(body.currentAssessment.change.toVersion).toBe(2);
  expect(typeof body.currentAssessment.change.summary).toBe("string");
  expect(Array.isArray(body.currentAssessment.change.changes)).toBe(true);

  const changeTypes = body.currentAssessment.change.changes.map((c: { type: string }) => c.type);
  expect(changeTypes).toContain("band");
  expect(changeTypes).toContain("supporting_evidence");
  expect(changeTypes).toContain("contradicting_evidence");

  expect(body.history.length).toBe(1);
  expect(body.history[0].version).toBe(1);
  // v1 is the claim's very first assessment - nothing precedes it, so it
  // must carry no change narrative of its own.
  expect(body.history[0].change).toBeNull();

  const raw = JSON.stringify(body.currentAssessment.change);
  expect(raw).not.toContain("verificationConfidence");
  expect(raw).not.toContain("assessmentReasons");
  expect(raw).not.toContain("modelVersion");
  expect(raw).not.toMatch(/0\.\d\d/);
  expect(raw).not.toMatch(/%/);
  expect(raw.toLowerCase()).not.toContain("because");
  expect(raw.toLowerCase()).not.toContain("proved");
});

test("change is null for a claim with only one assessment version ever", async ({ request }) => {
  const { claim } = await findOrCreateClaim(`Single-version claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  await buildAndPersistTrustAssessment(String(claim._id));

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.currentAssessment.change).toBeNull();
  expect(body.history).toEqual([]);
});

test("all existing Claim API fields remain unchanged alongside the new change/version fields", async ({
  request,
}) => {
  const { claimId } = await seedClaimWithTwoVersions(`Regression check claim ${new mongoose.Types.ObjectId()}`, [
    candidate(),
  ]);

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();
  expect(body.currentAssessment).not.toBeNull();
  expect(body.explanation).not.toBeNull();
  expect(body.uncertainty).not.toBeNull();
  expect(body.evidence).toBeDefined();
  expect(body.relatedPosts).toBeDefined();
  expect(body.follow).toEqual({ isFollowing: false, followerCount: 0 });
  expect(body.communityContext).toBeDefined();
});

// ---------------------------------------------------------------------------
// PART 2: presentation
// ---------------------------------------------------------------------------

test("rendered: Assessment History shows the change narrative, separate from Current Assessment, Why this assessment, and Evidence", async ({
  page,
}) => {
  const { claimId } = await seedClaimWithTwoVersions(`Rendered narrative claim ${new mongoose.Types.ObjectId()}`, [
    candidate({ stance: "supports" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: "Current Assessment" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Why this assessment" })).toBeVisible();

  await page.getByRole("button", { name: "Assessment History" }).click();
  const currentChange = page.getByTestId("claim-current-change");
  await expect(currentChange).toBeVisible();
  const text = (await currentChange.innerText()).toLowerCase();
  expect(text).toContain("assessment changed from insufficient evidence to");

  // The narrative caption belongs only inside Assessment History, not
  // duplicated into the Current Assessment card above it.
  await expect(page.getByText("Since the last recorded assessment")).toHaveCount(1);
});

test("rendered: no causal overclaim, truth-probability, or supersession wording in the change narrative", async ({
  page,
}) => {
  const { claimId } = await seedClaimWithTwoVersions(`Safety check claim ${new mongoose.Types.ObjectId()}`, [
    candidate({ stance: "supports" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await page.getByRole("button", { name: "Assessment History" }).click();
  const currentChange = page.getByTestId("claim-current-change");
  await expect(currentChange).toBeVisible({ timeout: 15_000 });
  const text = (await currentChange.innerText()).toLowerCase();
  expect(text).not.toContain("because");
  expect(text).not.toContain("proved");
  expect(text).not.toContain("became true");
  expect(text).not.toContain("became false");
  expect(text).not.toContain("superseded");
  expect(text).not.toContain("latest truth");
  expect(text).not.toContain("% ");
});
