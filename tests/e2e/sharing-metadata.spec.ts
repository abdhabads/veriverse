import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
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
const postIds: mongoose.Types.ObjectId[] = [];

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    EvidenceObject.deleteMany({ claimId: { $in: claimIds } }),
    TrustAssessment.deleteMany({ claim: { $in: claimIds } }),
    Post.deleteMany({ _id: { $in: postIds } }),
  ]);
  claimIds.length = 0;
  postIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

function extractMeta(html: string, attr: "property" | "name", key: string): string | null {
  const regex = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"[^>]*>`, "i");
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extractCanonical(html: string): string | null {
  const match = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i);
  return match ? match[1] : null;
}

test("claim metadata reflects the authoritative current assessment, not an older version", async ({ request }) => {
  const { claim } = await findOrCreateClaim(`Metadata claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  await persistEvidenceObjects({
    contentHash: "hash-v1",
    claimId,
    candidates: [candidate({ stance: "contradicts" })],
  });
  await buildAndPersistTrustAssessment(claimId);

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
    candidates: [candidate({ stance: "supports" }), candidate({ stance: "supports" })],
  });
  await buildAndPersistTrustAssessment(claimId);

  const res = await request.get(`/claims/${claimId}`);
  expect(res.status()).toBe(200);
  const html = await res.text();

  const ogTitle = extractMeta(html, "property", "og:title");
  const ogDescription = extractMeta(html, "property", "og:description");
  const twitterCard = extractMeta(html, "name", "twitter:card");
  const canonical = extractCanonical(html);

  expect(ogTitle).toContain("Metadata claim");
  expect(ogTitle).toContain("VeriVerse");
  // v2 has 2 supporting sources; the description must reflect v2, not v1's
  // single contradicting source.
  expect(ogDescription).toContain("2 supporting");
  expect(twitterCard).toBe("summary");
  expect(canonical).toBe(`https://www.veriverse.io/claims/${claimId}`);
});

test("claim with no current assessment gets the explicit fallback description, never a substituted verdict", async ({
  request,
}) => {
  const { claim } = await findOrCreateClaim(`No-assessment claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);

  const res = await request.get(`/claims/${claim._id}`);
  expect(res.status()).toBe(200);
  const html = await res.text();

  const ogDescription = extractMeta(html, "property", "og:description");
  expect(ogDescription).toBe("VeriVerse is currently assessing this claim.");
});

test("malformed and nonexistent claim IDs return 200 with generic fallback metadata, never a server error", async ({
  request,
}) => {
  const malformedRes = await request.get("/claims/not-a-real-id");
  expect(malformedRes.status()).toBe(200);
  const malformedHtml = await malformedRes.text();
  expect(extractMeta(malformedHtml, "property", "og:title")).toBe("Claim | VeriVerse");

  const fakeId = new mongoose.Types.ObjectId().toString();
  const nonexistentRes = await request.get(`/claims/${fakeId}`);
  expect(nonexistentRes.status()).toBe(200);
  const nonexistentHtml = await nonexistentRes.text();
  expect(extractMeta(nonexistentHtml, "property", "og:title")).toBe("Claim | VeriVerse");
});

test("post metadata contains author attribution and a canonical production URL, not a raw verdict", async ({
  request,
}) => {
  const author = await User.findOne({ email: "usera@test.com" });
  if (!author) throw new Error("Fixture user usera@test.com not found");

  const post = await Post.create({
    author: author._id,
    content: "The bridge on Main Street reopened after repairs.",
    status: "verified",
  });
  postIds.push(post._id);

  const res = await request.get(`/posts/${post._id}`);
  expect(res.status()).toBe(200);
  const html = await res.text();

  const ogTitle = extractMeta(html, "property", "og:title");
  const ogDescription = extractMeta(html, "property", "og:description");
  const twitterCard = extractMeta(html, "name", "twitter:card");
  const canonical = extractCanonical(html);

  expect(ogTitle).toBe(`Post by ${author.username} | VeriVerse`);
  expect(ogDescription).toContain("bridge on Main Street reopened");
  expect(ogDescription?.toLowerCase()).not.toContain("verified");
  expect(twitterCard).toBe("summary");
  expect(canonical).toBe(`https://www.veriverse.io/posts/${post._id}`);
});

test("Share claim appears in the overflow menu only when the post has a claimId, alongside the unchanged Share action", async ({
  page,
}) => {
  const { claim } = await findOrCreateClaim(`Entry-point claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);

  const author = await User.findOne({ email: "usera@test.com" });
  if (!author) throw new Error("Fixture user usera@test.com not found");

  const postWithClaim = await Post.create({
    author: author._id,
    content: "A post with a resolved claim, for Share-claim verification.",
    claimId: claim._id,
    status: "unverified",
  });
  postIds.push(postWithClaim._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/posts/${postWithClaim._id}`);

  const moreButton = page.getByRole("button", { name: /more actions/i });
  await moreButton.click();

  await expect(page.getByTestId(`share-post-${postWithClaim._id}`)).toBeVisible();
  await expect(page.getByTestId(`share-claim-${postWithClaim._id}`)).toBeVisible();
  await expect(page.getByTestId(`share-claim-${postWithClaim._id}`)).toHaveText(/share claim/i);
});
