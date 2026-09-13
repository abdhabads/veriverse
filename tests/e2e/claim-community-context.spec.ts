import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { login } from "./helpers";
import User from "@/models/User";
import Post from "@/models/Post";
import Claim from "@/models/Claim";
import UserRelation from "@/models/UserRelation";
import ReputationLog from "@/models/ReputationLog";
import RewardLog from "@/models/RewardLog";
import { findOrCreateClaim } from "@/lib/claimIdentity";

dotenv.config({ path: ".env.test.local" });

const claimIds: mongoose.Types.ObjectId[] = [];
const postIds: mongoose.Types.ObjectId[] = [];
const userIds: mongoose.Types.ObjectId[] = [];
const relationIds: mongoose.Types.ObjectId[] = [];

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    Post.deleteMany({ _id: { $in: postIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
    UserRelation.deleteMany({ _id: { $in: relationIds } }),
  ]);
  claimIds.length = 0;
  postIds.length = 0;
  userIds.length = 0;
  relationIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

async function seedClaim() {
  // Deliberately avoids the substring "Community Context" - that phrase is
  // also this feature's own section heading, and a claim whose canonicalText
  // (rendered as the page's H1) contains it would collide with heading
  // locators in the presentation/rendered-smoke tests below.
  const { claim } = await findOrCreateClaim(`CCTX fixture claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  return claim;
}

async function makeUser(overrides: Record<string, unknown> = {}) {
  const suffix = new mongoose.Types.ObjectId().toString();
  const user = await User.create({
    username: `cctx_${suffix}`,
    email: `cctx_${suffix}@test.com`,
    password: "hashed_password_not_real",
    moderationStatus: "active",
    ...overrides,
  });
  userIds.push(user._id);
  return user;
}

async function makePost(claimId: mongoose.Types.ObjectId, author: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  const post = await Post.create({
    author,
    claimId,
    content: `Community context test post ${new mongoose.Types.ObjectId()}`,
    ...overrides,
  });
  postIds.push(post._id);
  return post;
}

// ---------------------------------------------------------------------------
// PART 1: communityContext shape and counting semantics
// ---------------------------------------------------------------------------

test("communityContext has the exact expected shape, with expertReviewedPostCount absent when zero", async ({
  request,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.communityContext.relatedPostCount).toBe(1);
  expect(body.communityContext.contributorCount).toBe(1);
  expect(body.communityContext.followerCount).toBe(0);
  expect(body.communityContext.expertReviewedPostCount).toBeUndefined();
  expect(Object.keys(body.communityContext).sort()).toEqual([
    "contributorCount",
    "followerCount",
    "relatedPostCount",
  ]);
});

test("contributorCount deduplicates repeated Posts from the same author, while relatedPostCount does not", async ({
  request,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);
  await makePost(claim._id, author._id);
  await makePost(claim._id, author._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.communityContext.relatedPostCount).toBe(3);
  expect(body.communityContext.contributorCount).toBe(1);
});

test("different authors are counted separately as distinct contributors", async ({ request }) => {
  const claim = await seedClaim();
  const authorA = await makeUser();
  const authorB = await makeUser();
  await makePost(claim._id, authorA._id);
  await makePost(claim._id, authorB._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.communityContext.relatedPostCount).toBe(2);
  expect(body.communityContext.contributorCount).toBe(2);
});

test("followerCount in communityContext matches the existing follow.followerCount value exactly, with no redundant divergence", async ({
  baseURL,
  request,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  const api = await playwrightRequest.newContext({ baseURL });
  await api.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  await api.post(`/api/claims/${claim._id}/follow`);
  await api.dispose();

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.follow.followerCount).toBe(1);
  expect(body.communityContext.followerCount).toBe(1);
});

test("expertReviewedPostCount counts the full Claim-linked Post set, not just the newest-10 visible related posts", async ({
  request,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  const expert = await makeUser({ role: "expert" });

  // 10 recent posts (fill the visible window), plus one much older post that
  // carries the expert review - it must be excluded from the visible
  // relatedPosts list (newest-10 only) but MUST still count toward
  // expertReviewedPostCount, since that count queries the full set.
  const baseTime = Date.now();
  for (let i = 0; i < 10; i++) {
    await makePost(claim._id, author._id, { createdAt: new Date(baseTime - i * 1000) });
  }
  await makePost(claim._id, author._id, {
    createdAt: new Date(baseTime - 100_000),
    expertReviewedBy: expert._id,
  });

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.relatedPosts.length).toBe(10);
  expect(body.relatedPosts.some((p: any) => p.expertDecision !== undefined)).toBe(true);
  // The 11th (oldest, expert-reviewed) post must be absent from the visible list...
  expect(body.relatedPosts.length).toBe(10);
  // ...yet still counted in the full-set aggregate.
  expect(body.communityContext.expertReviewedPostCount).toBe(1);
  expect(body.communityContext.relatedPostCount).toBe(11);
});

test("the communityContext object never exposes voter, commenter, or reposter identities or counts", async ({
  request,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  const raw = JSON.stringify(body.communityContext);
  expect(raw).not.toContain("voter");
  expect(raw).not.toContain("comment");
  expect(raw).not.toContain("repost");
});

// ---------------------------------------------------------------------------
// PART 2: moderation and viewer block/mute - the key P3.9 invariant
// ---------------------------------------------------------------------------

test("a globally banned author's Posts are excluded from community-context aggregates entirely", async ({
  request,
}) => {
  const claim = await seedClaim();
  const activeAuthor = await makeUser();
  const bannedAuthor = await makeUser({ moderationStatus: "banned" });
  await makePost(claim._id, activeAuthor._id);
  await makePost(claim._id, bannedAuthor._id);

  const res = await request.get(`/api/claims/${claim._id}`);
  const body = await res.json();
  expect(body.communityContext.relatedPostCount).toBe(1);
  expect(body.communityContext.contributorCount).toBe(1);
});

test("a viewer-blocked author's Posts remain in the community-context aggregates, but are excluded from that viewer's visible relatedPosts list", async ({
  baseURL,
  request,
}) => {
  const claim = await seedClaim();
  const usera = await User.findOne({ username: "usera" });
  const blockedAuthor = await makeUser();
  await makePost(claim._id, blockedAuthor._id, { content: "Post from an author usera will block" });

  const relation = await UserRelation.create({
    sourceUser: usera!._id,
    targetUser: blockedAuthor._id,
    relationType: "block",
  });
  relationIds.push(relation._id);

  // Anonymous viewer: no block relationship applies to them at all.
  const anonymousRes = await request.get(`/api/claims/${claim._id}`);
  const anonymousBody = await anonymousRes.json();
  expect(anonymousBody.communityContext.relatedPostCount).toBe(1);
  expect(anonymousBody.communityContext.contributorCount).toBe(1);
  expect(anonymousBody.relatedPosts.length).toBe(1);

  // usera (who blocked this author): aggregates stay the same (they describe
  // the Claim, not this viewer), but the visible list excludes the post.
  const api = await playwrightRequest.newContext({ baseURL });
  await api.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  const viewerBody = await (await api.get(`/api/claims/${claim._id}`)).json();
  expect(viewerBody.communityContext.relatedPostCount).toBe(1);
  expect(viewerBody.communityContext.contributorCount).toBe(1);
  expect(viewerBody.relatedPosts.length).toBe(0);
  await api.dispose();
});

// ---------------------------------------------------------------------------
// PART 3: isolation
// ---------------------------------------------------------------------------

test("fetching the Claim's community context mutates nothing: Claim assessment version, reputation, reward points, and expert identity stay unchanged", async ({
  request,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  const beforeClaim = (await Claim.findById(claim._id))!.toObject();
  const usera = await User.findOne({ username: "usera" }).select("reputation rewardPoints role expertiseDomains");
  const beforeUser = usera!.toObject();
  const [reputationBefore, rewardBefore] = await Promise.all([
    ReputationLog.countDocuments({}),
    RewardLog.countDocuments({}),
  ]);

  await request.get(`/api/claims/${claim._id}`);

  const afterClaim = await Claim.findById(claim._id);
  expect(afterClaim!.currentAssessmentVersion).toBe(beforeClaim.currentAssessmentVersion);

  const afterUser = await User.findOne({ username: "usera" }).select(
    "reputation rewardPoints role expertiseDomains"
  );
  expect(afterUser!.reputation).toBe(beforeUser.reputation);
  expect(afterUser!.rewardPoints).toBe(beforeUser.rewardPoints);
  expect(afterUser!.role).toBe(beforeUser.role);
  expect(afterUser!.expertiseDomains).toEqual(beforeUser.expertiseDomains);

  const [reputationAfter, rewardAfter] = await Promise.all([
    ReputationLog.countDocuments({}),
    RewardLog.countDocuments({}),
  ]);
  expect(reputationAfter).toBe(reputationBefore);
  expect(rewardAfter).toBe(rewardBefore);
});

// ---------------------------------------------------------------------------
// PART 4: presentation
// ---------------------------------------------------------------------------

test("Community Context section renders Posts, Contributors, and Followers, and hides Expert-reviewed Posts when zero", async ({
  page,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claim._id}`);

  const context = page.getByTestId("claim-community-context");
  await expect(context.getByText("Community Context")).toBeVisible({ timeout: 15_000 });
  await expect(context.getByText("Posts", { exact: false })).toBeVisible();
  await expect(context.getByText("Contributors", { exact: false })).toBeVisible();
  await expect(context.getByText("Followers", { exact: false })).toBeVisible();
  await expect(context.getByText("Expert-reviewed Posts")).not.toBeVisible();
});

test("the ClaimFollowButton now lives inside Community Context, not inside Current Assessment", async ({ page }) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claim._id}`);

  const context = page.getByTestId("claim-community-context");
  await expect(context.getByTestId(`claim-follow-${claim._id}`)).toBeVisible({ timeout: 15_000 });
});

test("Posts Discussing This Claim and Assessment History remain present and unchanged", async ({ page }) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claim._id}`);

  await expect(page.getByText("Posts Discussing This Claim")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Assessment History")).toBeVisible();
});

test("no forbidden social-proof or composite-score wording appears anywhere on the Claim page", async ({ page }) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claim._id}`);
  await expect(page.getByTestId("claim-community-context")).toBeVisible({ timeout: 15_000 });

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(bodyText).not.toContain("people believe");
  expect(bodyText).not.toContain("community says");
  expect(bodyText).not.toContain("experts agree");
  expect(bodyText).not.toContain("verified by the community");
  expect(bodyText).not.toContain("community score");
  expect(bodyText).not.toContain("engagement score");
  expect(bodyText).not.toContain("popularity score");
  expect(bodyText).not.toContain("virality score");
});

// ---------------------------------------------------------------------------
// PART 5: rendered smoke
// ---------------------------------------------------------------------------

test("rendered smoke: Claim page hierarchy is readable with Community Context clearly separated from Current Assessment, and Follow works in its new location", async ({
  page,
}) => {
  const claim = await seedClaim();
  const author = await makeUser();
  await makePost(claim._id, author._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claim._id}`);

  await expect(page.getByRole("heading", { name: "Current Assessment" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Community Context" })).toBeVisible();
  await expect(page.getByText("Posts Discussing This Claim")).toBeVisible();

  const followButton = page.getByTestId(`claim-follow-${claim._id}`);
  await expect(followButton).toHaveText(/follow claim/i);
  await followButton.click();
  await expect(followButton).toHaveText(/following/i);
});
