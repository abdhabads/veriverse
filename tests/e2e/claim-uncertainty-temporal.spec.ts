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

async function seedAssessedClaim(text: string, candidates: EvidenceCandidate[]) {
  const { claim } = await findOrCreateClaim(text);
  claimIds.push(claim._id);
  const claimId = String(claim._id);
  await persistEvidenceObjects({ contentHash: `hash-${claimId}`, claimId, candidates });
  const assessment = await buildAndPersistTrustAssessment(claimId);
  return { claim, claimId, assessment };
}

// ---------------------------------------------------------------------------
// PART 1: API - uncertainty exists, is safe, and temporalScope flows through
// ---------------------------------------------------------------------------

test("uncertainty is present, well-shaped, and never leaks raw internals or probability language", async ({
  request,
}) => {
  const { claimId } = await seedAssessedClaim(`Uncertainty test claim ${new mongoose.Types.ObjectId()}`, [
    candidate({ stance: "supports" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  const res = await request.get(`/api/claims/${claimId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body.uncertainty).not.toBeNull();
  expect(typeof body.uncertainty.level).toBe("string");
  expect(Array.isArray(body.uncertainty.reasons)).toBe(true);

  const raw = JSON.stringify(body.uncertainty);
  expect(raw).not.toContain("assessmentReasons");
  expect(raw).not.toContain("verificationConfidence");
  expect(raw).not.toContain("modelVersion");
  expect(raw.toLowerCase()).not.toContain("probability");
  expect(raw.toLowerCase()).not.toContain("threshold");
  expect(raw).not.toMatch(/0\.\d\d/);
  expect(raw).not.toMatch(/%/);
});

test("uncertainty is null when no assessment is available yet, matching explanation's own null behavior", async ({
  request,
}) => {
  const { claim } = await findOrCreateClaim(`Unassessed uncertainty claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.assessmentStatus).toBe("assessment_not_available");
  expect(body.uncertainty).toBeNull();
});

test("Claim temporalScope flows through the API unchanged for presentation to consume", async ({ request }) => {
  const { claimId } = await seedAssessedClaim(
    `In September 2026, this specific test claim happened ${new mongoose.Types.ObjectId()}`,
    [candidate()]
  );

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();
  expect(body.claim.temporalScope).toBeDefined();
  expect(body.claim.temporalScope.type).toBe("specific");
  expect(body.claim.temporalScope.value).toBe("2026-09");
});

test("all existing Claim API fields remain unchanged alongside the new uncertainty field", async ({ request }) => {
  const { claimId } = await seedAssessedClaim(`Regression check claim ${new mongoose.Types.ObjectId()}`, [
    candidate(),
  ]);

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();
  expect(body.currentAssessment).not.toBeNull();
  expect(body.explanation).not.toBeNull();
  expect(body.evidence).toBeDefined();
  expect(body.history).toBeDefined();
  expect(body.relatedPosts).toBeDefined();
  expect(body.follow).toEqual({ isFollowing: false, followerCount: 0 });
  expect(body.communityContext).toBeDefined();
});

// ---------------------------------------------------------------------------
// PART 2: presentation - rendered on the Claim page
// ---------------------------------------------------------------------------

test("rendered: Context & Uncertainty shows caution reasons, separate from Why this assessment and Evidence", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim(`Rendered uncertainty claim ${new mongoose.Types.ObjectId()}`, [
    candidate({ stance: "supports" }),
    candidate({ stance: "contradicts", stanceConfidence: 0.9, relevanceScore: 0.9, domain: "other-example.com" }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: "Why this assessment" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Context & Uncertainty" })).toBeVisible();

  const uncertainty = page.getByTestId("claim-uncertainty");
  await expect(uncertainty).toBeVisible();
  await expect(uncertainty.getByRole("listitem").first()).toBeVisible();

  // Evidence stays a separate, distinctly-labeled section.
  await expect(page.getByRole("button", { name: /^Evidence$/i })).toBeVisible();
});

test("rendered: temporal applicability renders a readable sentence for a specific month-year claim", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim(
    `A specific-month temporal claim about September 2026 events ${new mongoose.Types.ObjectId()}`,
    [candidate()]
  );

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  const temporal = page.getByTestId("claim-temporal-applicability");
  await expect(temporal).toBeVisible({ timeout: 15_000 });
  await expect(temporal).toHaveText("This assessment applies to September 2026.");
});

test("rendered: no probability/percentage/certainty language, and insufficient evidence never implies false", async ({
  page,
}) => {
  const { claimId } = await seedAssessedClaim(`Insufficient evidence claim ${new mongoose.Types.ObjectId()}`, []);
  await buildAndPersistTrustAssessment(claimId);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: "Current Assessment" })).toBeVisible({ timeout: 15_000 });
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText).not.toContain("% chance");
  expect(bodyText).not.toContain("probability");
  expect(bodyText).not.toContain("likely true");
  expect(bodyText).not.toContain("likely false");
});

test("rendered: contested disagreement is surfaced without collapsing to a verdict", async ({ page }) => {
  const { claimId } = await seedAssessedClaim(`Contested disagreement claim ${new mongoose.Types.ObjectId()}`, [
    candidate({ stance: "supports", stanceConfidence: 0.9, relevanceScore: 0.9 }),
    candidate({
      stance: "contradicts",
      stanceConfidence: 0.9,
      relevanceScore: 0.9,
      domain: "other-example.com",
    }),
  ]);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  const uncertainty = page.getByTestId("claim-uncertainty");
  await expect(uncertainty).toBeVisible({ timeout: 15_000 });
  const text = (await uncertainty.innerText()).toLowerCase();
  expect(text).not.toContain("true");
  expect(text).not.toContain("false");
});
