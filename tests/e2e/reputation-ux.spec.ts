import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import ReputationLog from "@/models/ReputationLog";
import UserRelation from "@/models/UserRelation";
import { login } from "./helpers";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  await User.create([
    {
      username: "lb_active",
      email: "lb_active@test.com",
      password: "x",
      role: "user",
      moderationStatus: "active",
      reputation: 40,
      rewardPoints: 10,
    },
    {
      username: "lb_banned",
      email: "lb_banned@test.com",
      password: "x",
      role: "user",
      moderationStatus: "banned",
      reputation: 200,
      rewardPoints: 999,
    },
    {
      username: "lb_deactivated",
      email: "lb_deactivated@test.com",
      password: "x",
      role: "user",
      isDeactivated: true,
      reputation: 150,
      rewardPoints: 500,
    },
    {
      username: "lb_suspended_now",
      email: "lb_suspended_now@test.com",
      password: "x",
      role: "user",
      moderationStatus: "suspended",
      suspendedUntil: new Date(Date.now() + 60 * 60 * 1000),
      reputation: 120,
      rewardPoints: 300,
    },
    {
      username: "lb_suspended_expired",
      email: "lb_suspended_expired@test.com",
      password: "x",
      role: "user",
      moderationStatus: "suspended",
      suspendedUntil: new Date(Date.now() - 60 * 60 * 1000),
      reputation: 60,
      rewardPoints: 5,
    },
    {
      username: "lb_tie_a",
      email: "lb_tie_a@test.com",
      password: "x",
      role: "user",
      moderationStatus: "active",
      reputation: 40,
      rewardPoints: 30,
    },
    {
      username: "lb_tie_b",
      email: "lb_tie_b@test.com",
      password: "x",
      role: "user",
      moderationStatus: "active",
      reputation: 40,
      rewardPoints: 20,
    },
  ]);
  await mongoose.disconnect();
});

test("leaderboard excludes banned, deactivated, and currently-suspended users, but includes an expired suspension", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/leaderboard");
  expect(res.ok()).toBeTruthy();

  const json = await res.json();
  const usernames = json.users.map((u: any) => u.username);

  expect(usernames).not.toContain("lb_banned");
  expect(usernames).not.toContain("lb_deactivated");
  expect(usernames).not.toContain("lb_suspended_now");
  expect(usernames).not.toContain("userb"); // prepareTestDb's own suspended fixture

  expect(usernames).toContain("lb_suspended_expired");
  expect(usernames).toContain("lb_active");
  expect(usernames).toContain("admin1");

  await api.dispose();
});

test("leaderboard ranking stays reputation-descending with a rewardPoints tie-break, unmodified by the availability filter", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/leaderboard");
  const json = await res.json();
  const users = json.users as Array<{ username: string; reputation: number; rewardPoints: number }>;

  // Overall list stays non-increasing by reputation.
  for (let i = 1; i < users.length; i++) {
    expect(users[i].reputation).toBeLessThanOrEqual(users[i - 1].reputation);
  }

  // Same-reputation tie-break: higher rewardPoints ranks first.
  const tieAIndex = users.findIndex((u) => u.username === "lb_tie_a");
  const tieBIndex = users.findIndex((u) => u.username === "lb_tie_b");
  expect(tieAIndex).toBeGreaterThanOrEqual(0);
  expect(tieBIndex).toBeGreaterThanOrEqual(0);
  expect(tieAIndex).toBeLessThan(tieBIndex);

  await api.dispose();
});

test("ReputationInfo disclosure renders the reputation/claim-truth distinction, with no 'trust score' wording on touched pages", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/profile");

  const disclosure = page.getByText("What is reputation?").first();
  await expect(disclosure).toBeVisible({ timeout: 10_000 });
  await disclosure.click();

  await expect(
    page.getByText(
      "Reputation reflects past participation on VeriVerse. It does not determine whether a specific claim is true.",
      { exact: false }
    )
  ).toBeVisible();

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(bodyText).not.toContain("trust score");

  await page.goto("/reputation");
  const reputationBodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(reputationBodyText).not.toContain("trust score");

  await page.goto("/leaderboard");
  const leaderboardBodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(leaderboardBodyText).not.toContain("trust score");
});

test("GET /api/reputation succeeds and returns a populated referencePost when a real ReputationLog exists", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const loginRes = await api.post("/api/login", {
    data: { email: "usera@test.com", password: "Password123!" },
  });
  const userAId = (await loginRes.json()).user._id;

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const post = await Post.create({
    author: userAId,
    content: "A finalized claim referenced by a reputation log entry.",
    status: "verified",
    aiLabel: "safe",
  });
  await ReputationLog.create({
    user: userAId,
    actionType: "accurate_post",
    pointsChange: 5,
    reason: "Community finalized your post as verified.",
    referencePost: post._id,
    trustDecisionVersion: 1,
  });
  await mongoose.disconnect();

  // This is exactly the condition that previously 500'd: a real
  // ReputationLog document whose referencePost is non-null, requiring
  // Mongoose to resolve the "Post" model during .populate().
  const res = await api.get("/api/reputation");
  expect(res.status()).toBe(200);

  const json = await res.json();
  expect(json.success).toBe(true);

  const matchingLog = json.logs.find(
    (log: any) => String(log.referencePost?._id) === String(post._id)
  );
  expect(matchingLog).toBeTruthy();
  expect(matchingLog.referencePost.content).toBe(
    "A finalized claim referenced by a reputation log entry."
  );

  await api.dispose();
});

// ---------------------------------------------------------------------------
// P3.7 - Top Contributors: viewer-specific block/mute
// ---------------------------------------------------------------------------

test("Top Contributors excludes a viewer-blocked user for that viewer only, while an anonymous viewer still sees them", async ({
  baseURL,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const target = await User.findOne({ username: "lb_active" });
  await UserRelation.create({ sourceUser: usera!._id, targetUser: target!._id, relationType: "block" });
  await mongoose.disconnect();

  const anonymousApi = await playwrightRequest.newContext({ baseURL });
  const anonymousBody = await (await anonymousApi.get("/api/leaderboard")).json();
  expect(anonymousBody.users.map((u: any) => u.username)).toContain("lb_active");
  await anonymousApi.dispose();

  const viewerApi = await playwrightRequest.newContext({ baseURL });
  await viewerApi.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  const viewerBody = await (await viewerApi.get("/api/leaderboard")).json();
  expect(viewerBody.users.map((u: any) => u.username)).not.toContain("lb_active");
  await viewerApi.dispose();
});

test("Top Contributors excludes a viewer-muted user for that viewer only", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const target = await User.findOne({ username: "lb_tie_a" });
  await UserRelation.create({ sourceUser: usera!._id, targetUser: target!._id, relationType: "mute" });
  await mongoose.disconnect();

  const viewerApi = await playwrightRequest.newContext({ baseURL });
  await viewerApi.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  const viewerBody = await (await viewerApi.get("/api/leaderboard")).json();
  expect(viewerBody.users.map((u: any) => u.username)).not.toContain("lb_tie_a");
  await viewerApi.dispose();
});

test("ranking mechanics (reputation desc, rewardPoints tie-break, limit) are unchanged by block/mute filtering", async ({
  baseURL,
}) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/leaderboard");
  const json = await res.json();
  expect(json.users.length).toBeLessThanOrEqual(20);
  for (let i = 1; i < json.users.length; i++) {
    expect(json.users[i].reputation).toBeLessThanOrEqual(json.users[i - 1].reputation);
  }
  await api.dispose();
});

// ---------------------------------------------------------------------------
// P3.7 - Top Contributors terminology
// ---------------------------------------------------------------------------

test("the renamed Top Contributors page shows the new terminology, with no Trust Score/Truth Score/Most Trusted wording", async ({
  page,
}) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/leaderboard");

  await expect(page.getByRole("heading", { name: "Top Contributors" })).toBeVisible({ timeout: 15_000 });

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(bodyText).not.toContain("trust score");
  expect(bodyText).not.toContain("truth score");
  expect(bodyText).not.toContain("most trusted");
});

// ---------------------------------------------------------------------------
// P3.7 - Reputation history page: human-readable mapping, safe fields only
// ---------------------------------------------------------------------------

test("reputation history renders human-readable outcome labels and signed deltas, never raw internal fields", async ({
  page,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await ReputationLog.create([
    {
      user: usera!._id,
      actionType: "accurate_post",
      pointsChange: 5,
      reason: "Community finalized your post as verified.",
      trustDecisionVersion: 3,
      trustEventKey: `post:${new mongoose.Types.ObjectId()}:v3:community_finalize_verified`,
    },
    {
      user: usera!._id,
      actionType: "false_post_penalty",
      pointsChange: -5,
      reason: "Community finalized your post as false.",
      trustDecisionVersion: 4,
      trustEventKey: `post:${new mongoose.Types.ObjectId()}:v4:community_finalize_false`,
    },
  ]);
  await mongoose.disconnect();

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/reputation");

  await expect(page.getByText("Your post was verified by the community")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Your post was marked false by the community")).toBeVisible();
  await expect(page.getByText("+5", { exact: true })).toBeVisible();
  await expect(page.getByText("-5", { exact: true })).toBeVisible();

  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText).not.toContain("accurate_post");
  expect(bodyText).not.toContain("false_post_penalty");
  expect(bodyText).not.toContain("Community finalized your post as verified."); // raw `reason`
  expect(bodyText).not.toContain("trustEventKey");
  expect(bodyText.toLowerCase()).not.toContain("version: 3");
  expect(bodyText.toLowerCase()).not.toContain("version: 4");

  await expect(page.getByText(/weight of community votes/i)).toBeVisible();

  await mongoose.connect(process.env.MONGO_URI!);
  await ReputationLog.deleteMany({ user: usera!._id });
  await mongoose.disconnect();
});

test("an account with zero recorded reputation activity gets an honest empty state, not a fabricated explanation", async ({
  page,
}) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/reputation");

  await expect(
    page.getByText("No reputation activity has been recorded for this account yet.").first()
  ).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// P3.7 - Public profile stays summary-only; owner-only history affordance
// ---------------------------------------------------------------------------

test("own profile shows a View reputation history link; the public profile of another user does not", async ({
  page,
}) => {
  await login(page, "usera@test.com", "Password123!");

  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "View reputation history" })).toBeVisible({ timeout: 15_000 });

  await page.goto("/u/admin1");
  await expect(page.getByRole("heading", { name: "admin1" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "View reputation history" })).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// P3.7 - Isolation: presentation-only, no side effects
// ---------------------------------------------------------------------------

test("visiting the reputation and Top Contributors pages does not mutate reputation, rewardPoints, or expert identity", async ({
  page,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const before = await User.findOne({ username: "usera" }).select(
    "reputation rewardPoints role expertiseDomains"
  );
  const beforeSnapshot = before!.toObject();
  await mongoose.disconnect();

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/reputation");
  await page.goto("/leaderboard");
  await page.goto("/profile");

  await mongoose.connect(process.env.MONGO_URI!);
  const after = await User.findOne({ username: "usera" }).select(
    "reputation rewardPoints role expertiseDomains"
  );
  expect(after!.reputation).toBe(beforeSnapshot.reputation);
  expect(after!.rewardPoints).toBe(beforeSnapshot.rewardPoints);
  expect(after!.role).toBe(beforeSnapshot.role);
  expect(after!.expertiseDomains).toEqual(beforeSnapshot.expertiseDomains);
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// P3.7 - Rendered smoke: own profile -> View reputation history -> /reputation
// ---------------------------------------------------------------------------

test("rendered smoke: own profile links through to /reputation, showing the current number, explanation, and activity", async ({
  page,
}) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/profile");

  await Promise.all([
    page.waitForURL(/\/reputation/),
    page.getByRole("button", { name: "View reputation history" }).click(),
  ]);

  await expect(page.getByText("Current Reputation")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Reputation reflects past participation on VeriVerse.", { exact: false })
  ).toBeVisible();
  await expect(page.getByText(/weight of community votes/i)).toBeVisible();
  await expect(page.getByText("Recorded reputation activity")).toBeVisible();
});
