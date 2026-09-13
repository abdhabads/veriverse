import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import Claim from "@/models/Claim";
import ReputationLog from "@/models/ReputationLog";
import RewardLog from "@/models/RewardLog";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { login } from "./helpers";

dotenv.config({ path: ".env.test.local" });

const postIds: mongoose.Types.ObjectId[] = [];
const claimIds: mongoose.Types.ObjectId[] = [];

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

test.afterEach(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
  await Promise.all([
    Post.deleteMany({ _id: { $in: postIds } }),
    Claim.deleteMany({ _id: { $in: claimIds } }),
  ]);
  await mongoose.disconnect();
  postIds.length = 0;
  claimIds.length = 0;
});

async function makePost(overrides: Record<string, unknown>) {
  const post = await Post.create({
    content: `Contribution summary test post ${new mongoose.Types.ObjectId()}`,
    contentType: "claim",
    ...overrides,
  });
  postIds.push(post._id);
  return post;
}

// ---------------------------------------------------------------------------
// PART 1: GET /api/users/[username] - public contribution summary
// ---------------------------------------------------------------------------

test("ordinary public profile returns the correct Posts count and distinct Claims count, deduplicating repeated Claim links", async ({
  request,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  // prepareTestDb seeds usera with its own fixture Posts - clear them for an
  // exact, self-contained count in this test.
  await Post.deleteMany({ author: usera!._id });

  const { claim: claimA } = await findOrCreateClaim(`Contribution claim A ${new mongoose.Types.ObjectId()}`);
  const { claim: claimB } = await findOrCreateClaim(`Contribution claim B ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claimA._id, claimB._id);

  // Two posts link to claimA (must count once), one links to claimB, one is a
  // question with no claimId at all (counts toward Posts, not Claims).
  await makePost({ author: usera!._id, claimId: claimA._id });
  await makePost({ author: usera!._id, claimId: claimA._id });
  await makePost({ author: usera!._id, claimId: claimB._id });
  await makePost({ author: usera!._id, contentType: "question", claimId: null });
  await mongoose.disconnect();

  const res = await request.get("/api/users/usera");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.contribution.posts).toBe(4);
  expect(body.contribution.claims).toBe(2);
});

test("questions and instructions count toward Posts but never toward Claims when unlinked", async ({ request }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await Post.deleteMany({ author: usera!._id });
  await makePost({ author: usera!._id, contentType: "question", claimId: null });
  await makePost({ author: usera!._id, contentType: "instruction", claimId: null });
  await mongoose.disconnect();

  const res = await request.get("/api/users/usera");
  const body = await res.json();
  expect(body.contribution.posts).toBe(2);
  expect(body.contribution.claims).toBe(0);
});

test("flagged and under-review Posts still count toward Posts - this metric is authorship volume, not a quality endorsement", async ({
  request,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await Post.deleteMany({ author: usera!._id });
  await makePost({ author: usera!._id, status: "flagged" });
  await makePost({ author: usera!._id, status: "under_expert_review" });
  await makePost({ author: usera!._id, status: "under_appeal_review" });
  await mongoose.disconnect();

  const res = await request.get("/api/users/usera");
  const body = await res.json();
  expect(body.contribution.posts).toBe(3);
});

test("an ordinary user's public contribution summary never includes expertReviews", async ({ request }) => {
  const res = await request.get("/api/users/usera");
  const body = await res.json();
  expect(body.contribution.expertReviews).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(body.contribution, "expertReviews")).toBe(false);
});

test("an expert's public profile returns the correct expertReviews count", async ({ request }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const expert = await User.findOne({ username: "expert1" });
  const usera = await User.findOne({ username: "usera" });
  await makePost({ author: usera!._id, expertReviewedBy: expert!._id });
  await makePost({ author: usera!._id, expertReviewedBy: expert!._id });
  await mongoose.disconnect();

  const res = await request.get("/api/users/expert1");
  const body = await res.json();
  expect(body.contribution.expertReviews).toBe(2);
});

test("a Verified Expert with zero completed reviews safely returns expertReviews: 0, not undefined or an error", async ({
  request,
}) => {
  const res = await request.get("/api/users/expert1");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.contribution.expertReviews).toBe(0);
});

test("the public contribution summary never exposes private/safety/governance activity fields", async ({
  request,
}) => {
  const res = await request.get("/api/users/usera");
  const body = await res.json();
  const raw = JSON.stringify(body.contribution);
  expect(raw).not.toContain("comment");
  expect(raw).not.toContain("vote");
  expect(raw).not.toContain("repost");
  expect(raw).not.toContain("save");
  expect(raw).not.toContain("report");
  expect(raw).not.toContain("appeal");
  expect(raw).not.toContain("claimFollow");
  expect(raw).not.toContain("block");
  expect(raw).not.toContain("mute");
  expect(Object.keys(body.contribution).sort()).toEqual(["claims", "posts"]);
});

// ---------------------------------------------------------------------------
// PART 2: own-profile parity
// ---------------------------------------------------------------------------

test("GET /api/profile computes the same public contribution semantics for the owner", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await Post.deleteMany({ author: usera!._id });
  const { claim } = await findOrCreateClaim(`Own-profile contribution claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  await makePost({ author: usera!._id, claimId: claim._id });
  await makePost({ author: usera!._id, claimId: claim._id });
  await mongoose.disconnect();

  const api = await playwrightRequest.newContext({ baseURL });
  await api.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  const res = await api.get("/api/profile");
  const body = await res.json();
  expect(body.contribution.posts).toBe(2);
  expect(body.contribution.claims).toBe(1);
  await api.dispose();
});

// ---------------------------------------------------------------------------
// PART 3: presentation
// ---------------------------------------------------------------------------

test("ordinary profile renders Posts and Claims but not Expert Reviews", async ({ page }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await makePost({ author: usera!._id });
  await mongoose.disconnect();

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/profile");

  const stats = page.getByTestId("profile-stats");
  await expect(stats.getByText("Posts", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(stats.getByText("Claims", { exact: false })).toBeVisible();
  await expect(stats.getByText("Expert Reviews")).not.toBeVisible();
});

test("an expert's profile renders Posts, Claims, and Expert Reviews, safely showing zero", async ({ page }) => {
  await login(page, "expert@test.com", "Password123!");
  await page.goto("/profile");

  const stats = page.getByTestId("profile-stats");
  await expect(stats.getByText("Expert Reviews")).toBeVisible({ timeout: 15_000 });
});

test("no Contribution Score, Activity Score, Engagement Score, or Trust/Truth/Credibility Score wording appears", async ({
  page,
}) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/profile");
  await expect(page.getByText("Posts", { exact: false }).first()).toBeVisible({ timeout: 15_000 });

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(bodyText).not.toContain("contribution score");
  expect(bodyText).not.toContain("activity score");
  expect(bodyText).not.toContain("engagement score");
  expect(bodyText).not.toContain("trust score");
  expect(bodyText).not.toContain("truth score");
  expect(bodyText).not.toContain("credibility score");
});

// ---------------------------------------------------------------------------
// PART 4: isolation
// ---------------------------------------------------------------------------

test("reading the contribution summary mutates nothing: reputation, rewardPoints, expert identity, Claim, and settlement ledgers stay unchanged", async ({
  request,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" }).select("reputation rewardPoints role expertiseDomains");
  const beforeUser = usera!.toObject();
  const { claim } = await findOrCreateClaim(`Isolation contribution claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const beforeClaim = claim.toObject();
  const [reputationBefore, rewardBefore] = await Promise.all([
    ReputationLog.countDocuments({}),
    RewardLog.countDocuments({}),
  ]);
  await mongoose.disconnect();

  await request.get("/api/users/usera");
  await request.get(`/api/claims/${claim._id}`);

  await mongoose.connect(process.env.MONGO_URI!);
  const afterUser = await User.findOne({ username: "usera" }).select(
    "reputation rewardPoints role expertiseDomains"
  );
  expect(afterUser!.reputation).toBe(beforeUser.reputation);
  expect(afterUser!.rewardPoints).toBe(beforeUser.rewardPoints);
  expect(afterUser!.role).toBe(beforeUser.role);
  expect(afterUser!.expertiseDomains).toEqual(beforeUser.expertiseDomains);

  const afterClaim = await Claim.findById(claim._id);
  expect(afterClaim!.currentAssessmentVersion).toBe(beforeClaim.currentAssessmentVersion);

  const [reputationAfter, rewardAfter] = await Promise.all([
    ReputationLog.countDocuments({}),
    RewardLog.countDocuments({}),
  ]);
  expect(reputationAfter).toBe(reputationBefore);
  expect(rewardAfter).toBe(rewardBefore);
  await mongoose.disconnect();
});
