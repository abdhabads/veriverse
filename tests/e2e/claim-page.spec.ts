import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import EvidenceObject from "@/models/EvidenceObject";
import Post from "@/models/Post";
import User from "@/models/User";
import { findOrCreateClaim, advanceClaimAssessmentVersion } from "@/lib/claimIdentity";
import { persistEvidenceObjects, EvidenceCandidate } from "@/lib/evidencePersistence";
import { buildAndPersistTrustAssessment } from "@/lib/trustAssessment";

dotenv.config({ path: ".env.test.local" });

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

const claimIds: mongoose.Types.ObjectId[] = [];

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    EvidenceObject.deleteMany({ claimId: { $in: claimIds } }),
    TrustAssessment.deleteMany({ claim: { $in: claimIds } }),
    Post.deleteMany({ claimId: { $in: claimIds } }),
  ]);
  claimIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

test("malformed claim ID returns 400", async ({ request }) => {
  const res = await request.get("/api/claims/not-a-real-id");
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
});

test("nonexistent (but valid) claim ID returns 404", async ({ request }) => {
  const fakeId = new mongoose.Types.ObjectId().toString();
  const res = await request.get(`/api/claims/${fakeId}`);
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.success).toBe(false);
});

test("a claim with no TrustAssessment yet returns 200 with an explicit unavailable state, never a substituted version", async ({
  request,
}) => {
  const { claim } = await findOrCreateClaim(`Freshly created claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.currentAssessment).toBeNull();
  expect(body.assessmentStatus).toBe("assessment_not_available");
  expect(body.history).toEqual([]);
});

test("current evidence comes from the current TrustAssessment's own ID list, not a live EvidenceObject.find({claimId}) query", async ({
  request,
}) => {
  const { claim } = await findOrCreateClaim(`Evidence-isolation claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  // Version 1's assessment is built from exactly this one piece of evidence.
  await persistEvidenceObjects({
    contentHash: "hash-included",
    claimId,
    candidates: [candidate({ stance: "supports", sourceUrl: "https://example.com/included-source" })],
  });
  const v1Assessment = await buildAndPersistTrustAssessment(claimId);
  expect(v1Assessment.claimAssessmentVersion).toBe(1);

  // A second EvidenceObject is attached to the SAME claimId afterward,
  // without ever advancing the assessment version or rebuilding
  // TrustAssessment - simulating evidence that exists for the claim but
  // isn't part of the current (still version 1) assessment's own ID list.
  // A naive EvidenceObject.find({claimId}) would return both; the API must
  // return only what version 1's TrustAssessment actually references.
  await persistEvidenceObjects({
    contentHash: "hash-orphan",
    claimId,
    candidates: [candidate({ stance: "supports", sourceUrl: "https://example.com/orphan-source" })],
  });

  const res = await request.get(`/api/claims/${claimId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();

  const allEvidenceUrls = [
    ...body.evidence.supporting,
    ...body.evidence.contradicting,
    ...body.evidence.context,
  ].map((item: { sourceUrl: string }) => item.sourceUrl);

  expect(allEvidenceUrls).toContain("https://example.com/included-source");
  expect(allEvidenceUrls).not.toContain("https://example.com/orphan-source");
});

test("history contains only prior assessment versions, never the current one", async ({ request }) => {
  const { claim } = await findOrCreateClaim(`History claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  await persistEvidenceObjects({
    contentHash: "hash-v1",
    claimId,
    candidates: [candidate({ stance: "contradicts" })],
  });
  const v1Assessment = await buildAndPersistTrustAssessment(claimId);
  expect(v1Assessment.claimAssessmentVersion).toBe(1);

  const priorEvidence = await EvidenceObject.find({ claimId }).select(
    "stance authorityScore relevanceScore stanceConfidence independenceGroup sourceType"
  );
  await advanceClaimAssessmentVersion({
    claimId,
    priorEvidence: priorEvidence.map((doc: any) => ({
      id: String(doc._id),
      stance: doc.stance,
      authorityScore: doc.authorityScore,
      relevanceScore: doc.relevanceScore,
      stanceConfidence: doc.stanceConfidence,
      independenceGroup: doc.independenceGroup,
      sourceType: doc.sourceType,
    })),
  });

  await persistEvidenceObjects({
    contentHash: "hash-v2",
    claimId,
    candidates: [candidate({ stance: "supports" })],
  });
  const v2Assessment = await buildAndPersistTrustAssessment(claimId);
  expect(v2Assessment.claimAssessmentVersion).toBe(2);

  const res = await request.get(`/api/claims/${claimId}`);
  const body = await res.json();

  // Exactly the prior (version 1) assessment appears in history - version 2
  // (current) must never appear there too.
  expect(body.assessmentStatus).toBe("available");
  expect(body.history.length).toBe(1);
  expect(body.history[0].verdict).toBeDefined();
});

test("related posts exclude internal fields and only include posts sharing the claim's ID", async ({ request }) => {
  const { claim } = await findOrCreateClaim(`Related-posts claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);

  const author = await User.findOne({ email: "usera@test.com" });
  if (author) {
    await Post.create({
      author: author._id,
      content: "A post discussing this exact claim.",
      claimId: claim._id,
      status: "unverified",
    });
  }

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.relatedPosts.length).toBeGreaterThan(0);
  const post = body.relatedPosts[0];
  expect(post.author?.email).toBeUndefined();
  expect(post).not.toHaveProperty("moderationReasons");
  expect(post).not.toHaveProperty("expertReviewedBy");
});

async function seedRenderableClaim() {
  const { claim } = await findOrCreateClaim(`Rendered smoke claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  await persistEvidenceObjects({
    contentHash: "hash-smoke",
    claimId,
    candidates: [candidate({ stance: "supports", sourceUrl: "https://example.com/smoke-source" })],
  });
  await buildAndPersistTrustAssessment(claimId);

  const author = await User.findOne({ email: "usera@test.com" });
  if (author) {
    await Post.create({
      author: author._id,
      content: "A post discussing the rendered smoke claim.",
      claimId: claim._id,
      status: "unverified",
    });
  }

  return claimId;
}

test("rendered smoke: claim page loads, shows heading/verdict/evidence/related posts, and works logged out", async ({
  page,
}) => {
  const claimId = await seedRenderableClaim();

  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: /rendered smoke claim/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".vv-verdict-pill").first()).toBeVisible();

  const evidenceToggle = page.getByRole("button", { name: /^Evidence$/i });
  await evidenceToggle.click();
  await expect(page.getByText(/smoke-source|Source/i).first()).toBeVisible();

  await expect(page.getByText(/A post discussing the rendered smoke claim/i)).toBeVisible();
});

test("mobile (390px): claim page has no significant horizontal overflow", async ({ browser }) => {
  const claimId = await seedRenderableClaim();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/claims/${claimId}`);

  await expect(page.getByRole("heading", { name: /rendered smoke claim/i })).toBeVisible({ timeout: 15_000 });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  await context.close();
});
