import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { persistEvidenceObjects, EvidenceCandidate } from "@/lib/evidencePersistence";
import { buildAndPersistTrustAssessment } from "@/lib/trustAssessment";
import { getClaimExplanation } from "@/lib/claimPresentation";

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
  const { claim } = await findOrCreateClaim(`Explanation test claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);
  await persistEvidenceObjects({ contentHash: `hash-${claimId}`, claimId, candidates });
  const assessment = await buildAndPersistTrustAssessment(claimId);
  return { claim, claimId, assessment };
}

// ---------------------------------------------------------------------------
// PART 1: API - explanation exists, matches the authoritative assessment,
// leaks nothing internal
// ---------------------------------------------------------------------------

test("explanation exists and exactly matches what getClaimExplanation computes from the authoritative TrustAssessment", async ({
  request,
}) => {
  const { claimId, assessment } = await seedAssessedClaim([
    candidate({ stance: "supports" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  const res = await request.get(`/api/claims/${claimId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.assessmentStatus).toBe("available");
  expect(body.explanation).not.toBeNull();

  const expected = getClaimExplanation({
    assessmentBand: assessment.assessmentBand,
    independentSupportingCount: assessment.evidenceStrength.independentSupportingCount,
    directContradictionCount: assessment.contradictionStrength.directCount,
    weakContradictionCount: assessment.contradictionStrength.weakCount,
    confidenceLevel: assessment.verificationConfidence.level,
  });
  expect(body.explanation).toEqual(expected);
});

test("explanation is null when no assessment is available yet, matching currentAssessment's own null behavior", async ({
  request,
}) => {
  const { claim } = await findOrCreateClaim(`Unassessed explanation claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.assessmentStatus).toBe("assessment_not_available");
  expect(body.currentAssessment).toBeNull();
  expect(body.explanation).toBeNull();
});

test("the explanation object never leaks raw internal reason arrays, scores, or model version", async ({
  request,
}) => {
  const { claimId } = await seedAssessedClaim([candidate()]);

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();

  expect(Object.keys(body.explanation).sort()).toEqual(["reasons", "summary"]);
  const raw = JSON.stringify(body.explanation);
  expect(raw).not.toContain("assessmentReasons");
  expect(raw).not.toContain("evidenceStrength");
  expect(raw).not.toContain("contradictionStrength");
  expect(raw).not.toContain("verificationConfidence");
  expect(raw).not.toContain("modelVersion");
  expect(raw).not.toMatch(/0\.\d\d/); // no raw 0.xx heuristic score
});

test("all existing Claim API fields remain present and unchanged alongside the new explanation field", async ({
  request,
}) => {
  const { claimId } = await seedAssessedClaim([candidate()]);

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();
  expect(body.currentAssessment).not.toBeNull();
  expect(body.evidence).toBeDefined();
  expect(body.history).toBeDefined();
  expect(body.relatedPosts).toBeDefined();
  expect(body.follow).toEqual({ isFollowing: false, followerCount: 0 });
  expect(body.communityContext).toBeDefined();
});

// ---------------------------------------------------------------------------
// PART 2: presentation
// ---------------------------------------------------------------------------

test("rendered: 'Why this assessment' shows the summary and reasons, clearly separate from Current Assessment and Evidence", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim([
    candidate({ stance: "supports" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: "Current Assessment" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Why this assessment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Evidence$/i })).toBeVisible();

  const explanation = page.getByTestId("claim-explanation");
  await expect(explanation).toBeVisible();
  await expect(explanation.getByRole("listitem").first()).toBeVisible();
});

test("no forbidden AI-verdict, probability, or social-proof wording appears in the explanation section", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim([candidate()]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  const explanation = page.getByTestId("claim-explanation");
  await expect(explanation).toBeVisible({ timeout: 15_000 });
  const text = (await explanation.innerText()).toLowerCase();
  expect(text).not.toContain("ai verdict");
  expect(text).not.toContain("ai says");
  expect(text).not.toContain("veriverse believes");
  expect(text).not.toContain("probability");
  expect(text).not.toContain("% chance");
  expect(text).not.toContain("community says");
  expect(text).not.toContain("experts agree");
});

test("rendered smoke: full Claim page hierarchy remains readable with Why this assessment in place", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim([candidate()]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: "Current Assessment" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Why this assessment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Evidence$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community Context" })).toBeVisible();
  await expect(page.getByText("Assessment History")).toBeVisible();
  await expect(page.getByText("Posts Discussing This Claim")).toBeVisible();
});
