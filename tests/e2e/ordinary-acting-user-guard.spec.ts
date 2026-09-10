import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import Follow from "@/models/Follow";

dotenv.config({ path: ".env.test.local" });

async function apiLogin(baseURL: string | undefined, email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", { data: { email, password } });
  const json = await res.json();
  return { api, userId: json.user?._id as string | undefined };
}

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

// Each scenario logs in while usera is still active (login itself already
// correctly rejects banned/suspended/deactivated accounts - not what B2
// tests), then mutates usera's DB record directly to simulate a moderation
// action taken after the session token was already issued - the exact
// stale-JWT bypass this phase closes.

test("banned ordinary user cannot create a post", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "usera" }, { moderationStatus: "banned" });
  await mongoose.disconnect();

  const res = await api.post("/api/posts", {
    data: { content: "A post attempted by a banned user." },
  });
  expect(res.status()).toBe(403);
  const json = await res.json();
  expect(json.success).toBe(false);

  await api.dispose();
});

test("currently-suspended ordinary user cannot Follow", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  const admin1 = await User.findOne({ username: "admin1" });
  await User.updateOne(
    { username: "usera" },
    { moderationStatus: "suspended", suspendedUntil: new Date(Date.now() + 60 * 60 * 1000) }
  );
  await mongoose.disconnect();

  const res = await api.post("/api/follow", { data: { targetUserId: String(admin1!._id) } });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const edge = await Follow.findOne({ following: admin1!._id });
  expect(edge).toBeNull();
  await mongoose.disconnect();

  await api.dispose();
});

test("deactivated ordinary user cannot create a conversation", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  const admin1 = await User.findOne({ username: "admin1" });
  await User.updateOne({ username: "usera" }, { isDeactivated: true });
  await mongoose.disconnect();

  const res = await api.post("/api/messages/conversations", {
    data: { targetUserId: String(admin1!._id) },
  });
  expect(res.status()).toBe(403);

  await api.dispose();
});

test("active ordinary user still succeeds on a representative mutation", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const res = await api.post("/api/posts", {
    data: { content: "A post from an active user, proving normal mutation still works." },
  });
  expect(res.ok()).toBeTruthy();

  await api.dispose();
});

test("warned ordinary user still succeeds on a representative mutation", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "usera" }, { moderationStatus: "warned" });
  const post = await Post.findOne({ author: (await User.findOne({ username: "userb" }))!._id });
  await mongoose.disconnect();

  const res = await api.post("/api/like", { data: { postId: String(post!._id) } });
  expect(res.ok()).toBeTruthy();

  await api.dispose();
});

test("expired-suspension ordinary user still succeeds on a representative mutation", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne(
    { username: "usera" },
    { moderationStatus: "suspended", suspendedUntil: new Date(Date.now() - 60 * 60 * 1000) }
  );
  const post = await Post.findOne({ author: (await User.findOne({ username: "userb" }))!._id });
  await mongoose.disconnect();

  const res = await api.post("/api/save", { data: { postId: String(post!._id) } });
  expect(res.ok()).toBeTruthy();

  await api.dispose();
});

test("notification mark-read is rejected for a banned user", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "usera" }, { moderationStatus: "banned" });
  await mongoose.disconnect();

  const res = await api.patch("/api/notifications");
  expect(res.status()).toBe(403);

  await api.dispose();
});

test("suspended user's own appeal submission remains available", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const userb = await User.findOne({ username: "userb" });
  const appealablePost = await Post.create({
    author: userb!._id,
    content: "A post marked false, appealable by a suspended user.",
    status: "false",
    aiLabel: "safe",
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne(
    { username: "usera" },
    { moderationStatus: "suspended", suspendedUntil: new Date(Date.now() + 60 * 60 * 1000) }
  );
  await mongoose.disconnect();

  const res = await api.post("/api/appeals", {
    data: { postId: String(appealablePost._id), reason: "This was wrongly marked false." },
  });
  expect(res.ok()).toBeTruthy();

  await api.dispose();
});

test("an already-deactivated user can still finish account deletion", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne(
    { username: "usera" },
    {
      isDeactivated: true,
      deactivatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      deletionEligibleAt: new Date(Date.now() - 60 * 60 * 1000),
    }
  );
  await mongoose.disconnect();

  const res = await api.delete("/api/profile/account", {
    data: { password: "Password123!" },
  });
  expect(res.ok()).toBeTruthy();

  await api.dispose();
});
