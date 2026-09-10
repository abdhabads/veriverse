import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create([
    { username: "netuser1", email: "netuser1@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 10 },
    { username: "netuser2", email: "netuser2@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 20 },
    { username: "netuser3", email: "netuser3@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 30 },
    { username: "netuser4", email: "netuser4@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 40 },
    { username: "netuser5", email: "netuser5@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 50 },
    { username: "netuser6", email: "netuser6@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 60 },
    { username: "netuser7", email: "netuser7@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 70 },
    { username: "netuser8", email: "netuser8@test.com", password, role: "user", moderationStatus: "active", onboardingCompleted: true, reputation: 80 },
  ]);
  await mongoose.disconnect();
});

// Mirrors messages-api.spec.ts's loginAs: next dev forces NODE_ENV to
// "development" internally, so lib/rateLimitGuard.ts's test-mode bypass
// never engages here.
async function loginAs(baseURL: string | undefined, email: string) {
  const api = await playwrightRequest.newContext({ baseURL });

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await api.post("/api/login", { data: { email, password: "Password123!" } });
    if (res.status() !== 429) return api;

    const body = await res.json().catch(() => ({} as { retryAfterMs?: number }));
    const waitMs = Math.min(Number(body?.retryAfterMs) || 15000, 15000) + 250;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error(`Failed to log in as ${email} after retries (rate limited)`);
}

async function getUserId(api: any, username: string): Promise<string> {
  const res = await api.get(`/api/users/${username}`);
  const json = await res.json();
  return json.user._id;
}

async function connectDb() {
  await mongoose.connect(process.env.MONGO_URI!);
}

test("follower/following counts and list direction are correct", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1");
  const n2 = await getUserId(apiA, "netuser2");
  const n3 = await getUserId(apiA, "netuser3");

  await connectDb();
  await Follow.create([
    { follower: n1, following: userAId }, // netuser1 -> usera
    { follower: n2, following: userAId }, // netuser2 -> usera
    { follower: userAId, following: n3 }, // usera -> netuser3
  ]);
  await mongoose.disconnect();

  const bare = await (await apiA.get(`/api/followers/${userAId}`)).json();
  expect(bare.followers).toBe(2);
  expect(bare.following).toBe(1);

  const followersList = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "followers" } })
  ).json();
  const followerUsernames = followersList.users.map((u: any) => u.username).sort();
  expect(followerUsernames).toEqual(["netuser1", "netuser2"]);

  const followingList = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "following" } })
  ).json();
  expect(followingList.users.map((u: any) => u.username)).toEqual(["netuser3"]);

  await apiA.dispose();
});

test("list pagination respects limit and bounds", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1");
  const n2 = await getUserId(apiA, "netuser2");
  const n3 = await getUserId(apiA, "netuser3");

  await connectDb();
  await Follow.create([
    { follower: n1, following: userAId },
    { follower: n2, following: userAId },
    { follower: n3, following: userAId },
  ]);
  await mongoose.disconnect();

  const page1 = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "followers", limit: "2", page: "1" } })
  ).json();
  expect(page1.users.length).toBe(2);
  expect(page1.hasMore).toBe(true);

  const page2 = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "followers", limit: "2", page: "2" } })
  ).json();
  expect(page2.users.length).toBe(1);
  expect(page2.hasMore).toBe(false);

  await apiA.dispose();
});

test("hasMore is exactly false when the eligible result count is an exact multiple of limit", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1");
  const n2 = await getUserId(apiA, "netuser2");

  await connectDb();
  await Follow.create([
    { follower: n1, following: userAId },
    { follower: n2, following: userAId },
  ]);
  await mongoose.disconnect();

  // Exactly 2 eligible followers, limit=2: the old `users.length === limit`
  // formula would report hasMore:true here (2 === 2) even though nothing
  // more exists. The corrected limit+1 fetch must report false.
  const page = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "followers", limit: "2", page: "1" } })
  ).json();
  expect(page.users.length).toBe(2);
  expect(page.hasMore).toBe(false);

  await apiA.dispose();
});

test("filtering is applied before pagination, so excluded users occupying an early raw page do not hide later eligible users", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1"); // muted -> excluded
  const n2 = await getUserId(apiA, "netuser2"); // muted -> excluded
  const n3 = await getUserId(apiA, "netuser3"); // eligible
  const n4 = await getUserId(apiA, "netuser4"); // eligible

  await connectDb();
  const created = await Follow.create([
    { follower: n1, following: userAId },
    { follower: n2, following: userAId },
    { follower: n3, following: userAId },
    { follower: n4, following: userAId },
  ]);
  // Explicit descending createdAt (n1 newest ... n4 oldest) so the two
  // excluded users would occupy raw page 1 under the old buggy
  // paginate-then-populate approach (limit=2 would raw-select only n1/n2,
  // both filtered out, hiding n3/n4 entirely).
  const base = Date.now();
  await Follow.updateOne({ _id: created[0]._id }, { $set: { createdAt: new Date(base) } });
  await Follow.updateOne({ _id: created[1]._id }, { $set: { createdAt: new Date(base - 1000) } });
  await Follow.updateOne({ _id: created[2]._id }, { $set: { createdAt: new Date(base - 2000) } });
  await Follow.updateOne({ _id: created[3]._id }, { $set: { createdAt: new Date(base - 3000) } });
  await mongoose.disconnect();

  await apiA.post("/api/relations", { data: { targetUserId: n1, relationType: "mute" } });
  await apiA.post("/api/relations", { data: { targetUserId: n2, relationType: "mute" } });

  const page1 = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "followers", limit: "2", page: "1" } })
  ).json();
  expect(page1.users.map((u: any) => u.username).sort()).toEqual(["netuser3", "netuser4"]);
  expect(page1.hasMore).toBe(false);

  await apiA.dispose();
});

test("list excludes moderation-unavailable and viewer-blocked/muted users, but counts are unaffected", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1");
  const n2 = await getUserId(apiA, "netuser2");
  const userbId = await getUserId(apiA, "userb"); // prepareTestDb's suspended fixture

  await connectDb();
  await Follow.create([
    { follower: n1, following: userAId }, // will be muted by usera
    { follower: n2, following: userAId }, // stays visible
    { follower: userbId, following: userAId }, // moderation-unavailable
  ]);
  await mongoose.disconnect();

  await apiA.post("/api/relations", { data: { targetUserId: n1, relationType: "mute" } });

  const bare = await (await apiA.get(`/api/followers/${userAId}`)).json();
  expect(bare.followers).toBe(3); // counts reflect the real graph, unaffected by viewer filtering

  const list = await (
    await apiA.get(`/api/followers/${userAId}`, { params: { mode: "followers" } })
  ).json();
  const usernames = list.users.map((u: any) => u.username);
  expect(usernames).toEqual(["netuser2"]);

  await apiA.dispose();
});

test("single-target relationship context: following, followsYou, mutual, and self", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1");

  await connectDb();
  await Follow.create([
    { follower: userAId, following: n1 },
    { follower: n1, following: userAId },
  ]);
  await mongoose.disconnect();

  const mutualRes = await (
    await apiA.get("/api/follow", { params: { targetUserId: n1 } })
  ).json();
  expect(mutualRes.following).toBe(true);
  expect(mutualRes.followsYou).toBe(true);
  expect(mutualRes.mutual).toBe(true);

  const selfRes = await (
    await apiA.get("/api/follow", { params: { targetUserId: userAId } })
  ).json();
  expect(selfRes.following).toBe(false);
  expect(selfRes.followsYou).toBe(false);
  expect(selfRes.mutual).toBe(false);

  await apiA.dispose();
});

test("batch relationship context resolves forward and reverse state in one call each", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = await getUserId(apiA, "usera");
  const n1 = await getUserId(apiA, "netuser1");
  const n2 = await getUserId(apiA, "netuser2");

  await connectDb();
  await Follow.create([
    { follower: userAId, following: n1 }, // usera follows netuser1 only
    { follower: n2, following: userAId }, // netuser2 follows usera only
  ]);
  await mongoose.disconnect();

  const batch = await (
    await apiA.get("/api/follow", { params: { targetUserIds: `${n1},${n2}` } })
  ).json();

  expect(batch.states[n1]).toBe(true);
  expect(batch.states[n2]).toBe(false);
  expect(batch.followsYouStates[n1]).toBe(false);
  expect(batch.followsYouStates[n2]).toBe(true);

  await apiA.dispose();
});

test("suggestions exclude self/already-followed/blocked/muted/unavailable and stay bounded to 5", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const n1 = await getUserId(apiA, "netuser1"); // will be already-followed
  const n2 = await getUserId(apiA, "netuser2"); // will be blocked by usera
  const n3 = await getUserId(apiA, "netuser3"); // will be muted by usera

  await apiA.post("/api/follow", { data: { targetUserId: n1 } });
  await apiA.post("/api/relations", { data: { targetUserId: n2, relationType: "block" } });
  await apiA.post("/api/relations", { data: { targetUserId: n3, relationType: "mute" } });

  // netuser4 blocks usera (the reverse direction) - should also be excluded.
  const apiN4 = await loginAs(baseURL, "netuser4@test.com");
  const userAId = await getUserId(apiA, "usera");
  await apiN4.post("/api/relations", { data: { targetUserId: userAId, relationType: "block" } });

  const suggestionsRes = await (await apiA.get("/api/follow/suggestions")).json();
  const usernames = suggestionsRes.suggestions.map((s: any) => s.username);

  expect(usernames).not.toContain("usera");
  expect(usernames).not.toContain("netuser1");
  expect(usernames).not.toContain("netuser2");
  expect(usernames).not.toContain("netuser3");
  expect(usernames).not.toContain("netuser4");
  expect(usernames).not.toContain("userb"); // prepareTestDb's suspended fixture

  // admin1, expert1, netuser5, netuser6, netuser7, netuser8 remain eligible
  // (6 candidates) - genuinely more than 5, so this proves the cap actually
  // engages rather than coincidentally being satisfied.
  expect(suggestionsRes.suggestions.length).toBe(5);

  await apiA.dispose();
  await apiN4.dispose();
});
