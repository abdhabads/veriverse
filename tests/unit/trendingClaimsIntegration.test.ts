// tests/unit/trendingClaimsIntegration.test.ts
//
// Integration-level tests (real local test MongoDB, same pattern as
// tests/unit/claimChangeNotification.test.ts) for getTrendingClaims - the
// parts aggregateTrendingClaims's pure unit tests cannot cover: the 3-day
// window query, the authoritative-assessment-version invariant, moderation/
// block/mute exclusions, representative-post selection, and follow state.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import Post from "@/models/Post";
import Vote from "@/models/Vote";
import Comment from "@/models/Comment";
import Repost from "@/models/Repost";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import ClaimFollow from "@/models/ClaimFollow";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { getTrendingClaims, TREND_WINDOW_DAYS } from "@/lib/trendingClaims";

const uri = process.env.MONGO_URI;
const day = 24 * 60 * 60 * 1000;

let claimIds: mongoose.Types.ObjectId[] = [];
let userIds: mongoose.Types.ObjectId[] = [];
let postIds: mongoose.Types.ObjectId[] = [];

async function makeUser(overrides: Record<string, unknown> = {}) {
  const suffix = new mongoose.Types.ObjectId().toString();
  const user = await User.create({
    username: `trending_${suffix}`,
    email: `trending_${suffix}@test.com`,
    password: "hashed_password_not_real",
    ...overrides,
  });
  userIds.push(user._id);
  return user;
}

async function makeClaim() {
  const { claim } = await findOrCreateClaim(`Trending test claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  return claim;
}

async function makePost(claim: any, author: any, ageMs = 0) {
  const post = await Post.create({
    author: author._id,
    content: `Trending test post ${new mongoose.Types.ObjectId()}`,
    claimId: claim._id,
    createdAt: new Date(Date.now() - ageMs),
  });
  postIds.push(post._id);
  return post;
}

beforeAll(async () => {
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
});

afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    TrustAssessment.deleteMany({ claim: { $in: claimIds } }),
    Post.deleteMany({ _id: { $in: postIds } }),
    Vote.deleteMany({ post: { $in: postIds } }),
    Comment.deleteMany({ post: { $in: postIds } }),
    Repost.deleteMany({ post: { $in: postIds } }),
    ClaimFollow.deleteMany({ claim: { $in: claimIds } }),
    UserRelation.deleteMany({ sourceUser: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
  claimIds = [];
  userIds = [];
  postIds = [];
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("getTrendingClaims - integration", () => {
  it("uses the exact authoritative currentAssessmentVersion, never the most recently created row", async () => {
    const claim = await makeClaim();
    const authorA = await makeUser();
    const authorB = await makeUser();
    await makePost(claim, authorA);
    await makePost(claim, authorB);

    // Two assessment rows exist for this claim: an older v1, and a newer v2
    // that was created LAST (so createdAt-based sorting would pick it), but
    // the Claim's own currentAssessmentVersion still points at v1.
    await TrustAssessment.create({
      claim: claim._id,
      claimAssessmentVersion: 1,
      evidenceStrength: { band: "moderate", score: 1, confidence: 1, independentSupportingCount: 1 },
      contradictionStrength: { band: "none", directCount: 0, weakCount: 0, confidence: 1 },
      verificationConfidence: { level: "medium", score: 1 },
      assessmentBand: "weakly_supported",
      modelVersion: "test",
    });
    await Claim.updateOne({ _id: claim._id }, { currentAssessmentVersion: 1 });
    await TrustAssessment.create({
      claim: claim._id,
      claimAssessmentVersion: 2,
      evidenceStrength: { band: "strong", score: 2, confidence: 1, independentSupportingCount: 2 },
      contradictionStrength: { band: "none", directCount: 0, weakCount: 0, confidence: 1 },
      verificationConfidence: { level: "high", score: 2 },
      assessmentBand: "well_supported",
      modelVersion: "test",
    });
    // currentAssessmentVersion deliberately left at 1 - v2 exists but is NOT
    // the claim's current version.

    const results = await getTrendingClaims({ requesterId: null });
    const found = results.find((r) => r.id === String(claim._id));
    expect(found).toBeTruthy();
    expect(found!.assessmentStatus).toBe("available");
    expect(found!.currentAssessment!.verdict.label.toLowerCase()).toContain("weakly");
  });

  it("still surfaces a claim with no assessment at all as assessment_not_available (assessment-state independence)", async () => {
    const claim = await makeClaim();
    const authorA = await makeUser();
    const authorB = await makeUser();
    await makePost(claim, authorA);
    await makePost(claim, authorB);

    const results = await getTrendingClaims({ requesterId: null });
    const found = results.find((r) => r.id === String(claim._id));
    expect(found).toBeTruthy();
    expect(found!.assessmentStatus).toBe("assessment_not_available");
    expect(found!.currentAssessment).toBeNull();
  });

  it("excludes posts outside the trend window entirely", async () => {
    const claim = await makeClaim();
    const authorA = await makeUser();
    const authorB = await makeUser();
    await makePost(claim, authorA, (TREND_WINDOW_DAYS + 1) * day);
    await makePost(claim, authorB, (TREND_WINDOW_DAYS + 1) * day);

    const results = await getTrendingClaims({ requesterId: null });
    expect(results.find((r) => r.id === String(claim._id))).toBeUndefined();
  });

  it("excludes posts authored by a globally banned user from eligibility", async () => {
    const claim = await makeClaim();
    const bannedAuthor = await makeUser({ moderationStatus: "banned" });
    const otherAuthor = await makeUser();
    await makePost(claim, bannedAuthor);
    await makePost(claim, otherAuthor);

    // Only one eligible author remains post-exclusion - below threshold.
    const results = await getTrendingClaims({ requesterId: null });
    expect(results.find((r) => r.id === String(claim._id))).toBeUndefined();
  });

  it("skips a representative post from a blocked author for the viewer, without altering global rank order", async () => {
    const claim = await makeClaim();
    const viewer = await makeUser();
    const blockedAuthor = await makeUser();
    const otherAuthor = await makeUser();
    await makePost(claim, blockedAuthor, 1000); // more recent
    await makePost(claim, otherAuthor, 5000); // older, but visible to viewer

    await UserRelation.create({ sourceUser: viewer._id, targetUser: blockedAuthor._id, relationType: "block" });

    const anonymousResults = await getTrendingClaims({ requesterId: null });
    const anonymousFound = anonymousResults.find((r) => r.id === String(claim._id));
    expect(anonymousFound!.representativePost!.author.username).toBe(blockedAuthor.username);

    const viewerResults = await getTrendingClaims({ requesterId: String(viewer._id) });
    const viewerFound = viewerResults.find((r) => r.id === String(claim._id));
    expect(viewerFound!.representativePost!.author.username).toBe(otherAuthor.username);
    // Rank/eligibility must be identical regardless of the viewer's own block list.
    expect(viewerFound!.trend.score).toBe(anonymousFound!.trend.score);
  });

  it("reports accurate isFollowing for an authenticated follower vs. a non-follower, and false for an anonymous viewer", async () => {
    const claim = await makeClaim();
    const authorA = await makeUser();
    const authorB = await makeUser();
    await makePost(claim, authorA);
    await makePost(claim, authorB);

    const follower = await makeUser();
    const nonFollower = await makeUser();
    await ClaimFollow.create({ user: follower._id, claim: claim._id });

    const anonymous = await getTrendingClaims({ requesterId: null });
    expect(anonymous.find((r) => r.id === String(claim._id))!.follow.isFollowing).toBe(false);

    const asFollower = await getTrendingClaims({ requesterId: String(follower._id) });
    expect(asFollower.find((r) => r.id === String(claim._id))!.follow.isFollowing).toBe(true);

    const asNonFollower = await getTrendingClaims({ requesterId: String(nonFollower._id) });
    expect(asNonFollower.find((r) => r.id === String(claim._id))!.follow.isFollowing).toBe(false);
  });

  it("orders results by score descending, with a real vote/comment/repost signal mix", async () => {
    const lowClaim = await makeClaim();
    const highClaim = await makeClaim();

    const lowAuthorA = await makeUser();
    const lowAuthorB = await makeUser();
    await makePost(lowClaim, lowAuthorA);
    await makePost(lowClaim, lowAuthorB);

    const highAuthorA = await makeUser();
    const highAuthorB = await makeUser();
    const highPostA = await makePost(highClaim, highAuthorA);
    const highPostB = await makePost(highClaim, highAuthorB);
    const voter = await makeUser();
    const commenter = await makeUser();
    const reposter = await makeUser();
    await Vote.create({ post: highPostA._id, user: voter._id, voteType: "accurate" });
    await Comment.create({ post: highPostB._id, author: commenter._id, content: "test comment" });
    await Repost.create({ post: highPostA._id, user: reposter._id });

    const results = await getTrendingClaims({ requesterId: null });
    const lowIndex = results.findIndex((r) => r.id === String(lowClaim._id));
    const highIndex = results.findIndex((r) => r.id === String(highClaim._id));
    expect(lowIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeGreaterThanOrEqual(0);
    expect(highIndex).toBeLessThan(lowIndex);
  });
});
