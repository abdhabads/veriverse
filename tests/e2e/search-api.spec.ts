import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

// Creates the extra fixture accounts P1.2-A's filtering needs (blocked/muted
// target, and each moderation-unavailable state) with one distinctive post
// each, without touching the shared prepareTestDb.ts fixture script.
async function seedSearchFixtures() {
  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);

  const future = new Date(Date.now() + 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 60 * 1000);

  const [blocked, muted, deactivated, banned, suspended, expiredSuspension] = await User.create([
    { username: "searchblocked", email: "searchblocked@test.com", password: "x", role: "user" },
    { username: "searchmuted", email: "searchmuted@test.com", password: "x", role: "user" },
    {
      username: "searchdeactivated",
      email: "searchdeactivated@test.com",
      password: "x",
      role: "user",
      isDeactivated: true,
    },
    {
      username: "searchbanned",
      email: "searchbanned@test.com",
      password: "x",
      role: "user",
      moderationStatus: "banned",
    },
    {
      username: "searchsuspended",
      email: "searchsuspended@test.com",
      password: "x",
      role: "user",
      moderationStatus: "suspended",
      suspendedUntil: future,
    },
    {
      username: "searchexpiredsuspension",
      email: "searchexpiredsuspension@test.com",
      password: "x",
      role: "user",
      moderationStatus: "suspended",
      suspendedUntil: past,
    },
  ]);

  await Post.create([
    { author: blocked._id, content: "searchfixture content from blocked account", status: "unverified", aiLabel: "safe" },
    { author: muted._id, content: "searchfixture content from muted account", status: "unverified", aiLabel: "safe" },
    { author: deactivated._id, content: "searchfixture content from deactivated account", status: "unverified", aiLabel: "safe" },
    { author: banned._id, content: "searchfixture content from banned account", status: "unverified", aiLabel: "safe" },
    { author: suspended._id, content: "searchfixture content from suspended account", status: "unverified", aiLabel: "safe" },
    { author: expiredSuspension._id, content: "searchfixture content from expired-suspension account", status: "unverified", aiLabel: "safe" },
  ]);

  await mongoose.disconnect();

  return { blocked, muted, deactivated, banned, suspended, expiredSuspension };
}

test("anonymous search still works", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/search", { params: { q: "usera" } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.success).toBe(true);
  await api.dispose();
});

test("username search finds the matching user", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const json = await (await api.get("/api/search", { params: { q: "usera", type: "users" } })).json();
  expect((json.users || []).some((u: any) => u.username === "usera")).toBe(true);
  await api.dispose();
});

test("post-content search finds the matching post", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const json = await (
    await api.get("/api/search", { params: { q: "local clinic", type: "posts" } })
  ).json();
  expect((json.posts || []).some((p: any) => p.content.includes("local clinic"))).toBe(true);
  await api.dispose();
});

test("blocked user is excluded from People and Posts results", async ({ baseURL }) => {
  const { blocked } = await seedSearchFixtures();

  const apiA = await playwrightRequest.newContext({ baseURL });
  await apiA.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  await apiA.post("/api/relations", { data: { targetUserId: String(blocked._id), relationType: "block" } });

  const usersJson = await (await apiA.get("/api/search", { params: { q: "searchblocked", type: "users" } })).json();
  expect(usersJson.users).toEqual([]);

  const postsJson = await (
    await apiA.get("/api/search", { params: { q: "searchfixture content from blocked", type: "posts" } })
  ).json();
  expect(postsJson.posts).toEqual([]);

  await apiA.dispose();
});

test("muted user is excluded from People and Posts results", async ({ baseURL }) => {
  const { muted } = await seedSearchFixtures();

  const apiA = await playwrightRequest.newContext({ baseURL });
  await apiA.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });
  await apiA.post("/api/relations", { data: { targetUserId: String(muted._id), relationType: "mute" } });

  const usersJson = await (await apiA.get("/api/search", { params: { q: "searchmuted", type: "users" } })).json();
  expect(usersJson.users).toEqual([]);

  const postsJson = await (
    await apiA.get("/api/search", { params: { q: "searchfixture content from muted", type: "posts" } })
  ).json();
  expect(postsJson.posts).toEqual([]);

  await apiA.dispose();
});

test("deactivated, banned, and currently-suspended accounts are excluded from People results; an expired suspension is not", async ({ baseURL }) => {
  await seedSearchFixtures();

  const api = await playwrightRequest.newContext({ baseURL });
  const json = await (await api.get("/api/search", { params: { q: "search", type: "users" } })).json();
  const usernames: string[] = (json.users || []).map((u: any) => u.username);

  expect(usernames).not.toContain("searchdeactivated");
  expect(usernames).not.toContain("searchbanned");
  expect(usernames).not.toContain("searchsuspended");
  // An expired suspension mirrors login's own auto-reactivation semantics -
  // it must NOT be treated as unavailable.
  expect(usernames).toContain("searchexpiredsuspension");
  // Sanity check the query itself is broad enough to have found these if present.
  expect(usernames).toContain("searchblocked");

  await api.dispose();
});

test("deactivated and banned/suspended authors' posts are excluded from Post results", async ({ baseURL }) => {
  await seedSearchFixtures();

  const api = await playwrightRequest.newContext({ baseURL });
  const json = await (
    await api.get("/api/search", { params: { q: "searchfixture content from", type: "posts" } })
  ).json();
  const contents: string[] = (json.posts || []).map((p: any) => p.content);

  expect(contents.some((c) => c.includes("deactivated account"))).toBe(false);
  expect(contents.some((c) => c.includes("banned account"))).toBe(false);
  expect(contents.some((c) => c.includes("from suspended account"))).toBe(false);
  expect(contents.some((c) => c.includes("expired-suspension account"))).toBe(true);

  await api.dispose();
});

test("successful search response is private/no-store with no shared-cache directives", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/search", { params: { q: "usera" } });
  const cacheControl = (res.headers()["cache-control"] || "").toLowerCase();
  expect(cacheControl).toContain("private");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("s-maxage");
  expect(cacheControl).not.toContain("stale-while-revalidate");
  await api.dispose();
});

test("search is rate-limited past the configured threshold", async ({ baseURL }) => {
  // Authenticated with a freshly-seeded (per-beforeEach) account, so this
  // test's rate-limit bucket is isolated from the anonymous-IP bucket the
  // other tests in this file share, and from any other test's own account.
  const api = await playwrightRequest.newContext({ baseURL });
  await api.post("/api/login", { data: { email: "usera@test.com", password: "Password123!" } });

  let sawRateLimited = false;
  for (let i = 0; i < 31; i++) {
    const res = await api.get("/api/search", { params: { q: "usera" } });
    if (res.status() === 429) {
      sawRateLimited = true;
      break;
    }
  }

  expect(sawRateLimited).toBe(true);
  await api.dispose();
});
