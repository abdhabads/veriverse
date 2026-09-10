import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import Notification from "@/models/Notification";
import Conversation from "@/models/Conversation";
import { login } from "./helpers";

dotenv.config({ path: ".env.test.local" });

async function apiLogin(baseURL: string | undefined, email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", { data: { email, password } });
  const json = await res.json();
  return { api, userId: json.user._id as string };
}

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const seededCreatedAt = new Date(Date.now() - 10 * 60 * 1000);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create([
    {
      username: "safea",
      email: "safea@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 12,
      rewardPoints: 5,
      createdAt: seededCreatedAt,
    },
    {
      username: "safeb",
      email: "safeb@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 8,
      rewardPoints: 3,
      createdAt: seededCreatedAt,
    },
    {
      username: "safec",
      email: "safec@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 20,
      rewardPoints: 10,
      createdAt: seededCreatedAt,
    },
  ]);
  await mongoose.disconnect();
});

test("GET /api/users/[username] exposes only safe public fields and excludes sensitive account data", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOneAndUpdate(
    { username: "usera" },
    {
      bio: "A real bio for the privacy test.",
      moderationNote: "Internal note: prior warning for spam-adjacent posting.",
      riskScore: 42,
      suspiciousFlags: 3,
      suspendedUntil: new Date(Date.now() + 60 * 60 * 1000),
      warnedAt: new Date(),
      bannedAt: new Date(),
      isDeactivated: true,
      deactivatedAt: new Date(),
      deletionEligibleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      passwordResetTokenHash: "deadbeefdeadbeefdeadbeefdeadbeef",
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    { new: true }
  );
  await mongoose.disconnect();

  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/users/usera");
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);

  // Legitimate public fields survive and carry real values, proving this
  // isn't just an empty/undefined-default check.
  expect(json.user.username).toBe("usera");
  expect(json.user.bio).toBe("A real bio for the privacy test.");
  expect(typeof json.user.reputation).toBe("number");
  expect(typeof json.user.rewardPoints).toBe("number");
  expect(json.user._id).toBe(String(usera!._id));

  const sensitiveFields = [
    "email",
    "password",
    "passwordResetTokenHash",
    "passwordResetExpiresAt",
    "riskScore",
    "suspiciousFlags",
    "moderationNote",
    "moderationStatus",
    "suspendedUntil",
    "warnedAt",
    "bannedAt",
    "isDeactivated",
    "deactivatedAt",
    "deletionEligibleAt",
  ];
  for (const field of sensitiveFields) {
    expect(json.user, `response should not include "${field}"`).not.toHaveProperty(field);
  }

  await api.dispose();
});

test("an authenticated ordinary user sees Block, Mute, and Report controls on another user's post", async ({ page, baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const safeb = await User.findOne({ username: "safeb" });
  const post = await Post.create({
    author: safeb!._id,
    content: "A post authored by safeb for the ordinary-user safety-controls test.",
    status: "unverified",
    aiLabel: "safe",
  });
  await mongoose.disconnect();

  await login(page, "safea@test.com", "Password123!");
  await page.goto("/feed");

  const shareButton = page.getByTestId(`share-post-${post._id}`);
  await expect(shareButton).toBeVisible({ timeout: 10_000 });
  const card = shareButton.locator('xpath=ancestor::*[@data-testid="post-card"]');

  await expect(card.getByRole("button", { name: /^Block$/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Mute$/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Report$/ })).toBeVisible();
});

test("Follow respects a bidirectional block: neither party can follow the other, and no notification is created", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const safea = await User.findOne({ username: "safea" });
  const safeb = await User.findOne({ username: "safeb" });
  await UserRelation.create({
    sourceUser: safea!._id,
    targetUser: safeb!._id,
    relationType: "block",
  });
  await mongoose.disconnect();

  const { api: aApi } = await apiLogin(baseURL, "safea@test.com", "Password123!");
  const { api: bApi } = await apiLogin(baseURL, "safeb@test.com", "Password123!");

  // Blocker attempts to follow the blocked user.
  const aFollowsB = await aApi.post("/api/follow", { data: { targetUserId: String(safeb!._id) } });
  expect(aFollowsB.status()).toBe(403);

  // Blocked user attempts to follow the blocker (reverse direction).
  const bFollowsA = await bApi.post("/api/follow", { data: { targetUserId: String(safea!._id) } });
  expect(bFollowsA.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const followEdges = await Follow.find({
    $or: [
      { follower: safea!._id, following: safeb!._id },
      { follower: safeb!._id, following: safea!._id },
    ],
  });
  expect(followEdges.length).toBe(0);

  const notifs = await Notification.find({
    type: "new_follower",
    user: { $in: [safea!._id, safeb!._id] },
  });
  expect(notifs.length).toBe(0);

  // Remove the block and confirm a normal follow still succeeds.
  await UserRelation.deleteMany({});
  await mongoose.disconnect();

  const followAfterUnblock = await aApi.post("/api/follow", { data: { targetUserId: String(safeb!._id) } });
  expect(followAfterUnblock.ok()).toBeTruthy();
  const followJson = await followAfterUnblock.json();
  expect(followJson.following).toBe(true);

  await aApi.dispose();
  await bApi.dispose();
});

test("messaging endpoints handle a deleted conversation participant without crashing", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const safea = await User.findOne({ username: "safea" });
  const safec = await User.findOne({ username: "safec" });

  const [a, b] = [String(safea!._id), String(safec!._id)].sort();
  const conversation = await Conversation.create({
    participants: [a, b],
    participantKey: `${a}_${b}`,
    participantState: [
      { user: a, lastReadAt: null },
      { user: b, lastReadAt: null },
    ],
    lastMessageAt: new Date(),
    lastMessagePreview: "Hello before the account was deleted.",
  });

  // Simulate the counterpart's account no longer existing, without going
  // through the (separately-scoped) account-deletion cascade route.
  await User.findByIdAndDelete(safec!._id);
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "safea@test.com", "Password123!");

  const listRes = await api.get("/api/messages/conversations");
  expect(listRes.status()).toBe(200);
  const listJson = await listRes.json();
  expect(listJson.success).toBe(true);
  expect(
    listJson.conversations.some((c: any) => c._id === String(conversation._id))
  ).toBe(false);

  const detailRes = await api.get(`/api/messages/conversations/${conversation._id}`);
  expect(detailRes.status()).toBe(404);
  const detailJson = await detailRes.json();
  expect(detailJson.success).toBe(false);

  await api.dispose();
});
