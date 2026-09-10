import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";

dotenv.config({ path: ".env.test.local" });

const PARTNER_EMAIL = "msgpartner@test.com";
const PARTNER_USERNAME = "msgpartner";

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  // A dedicated, ordinary (not suspended/banned/deactivated) fixture user
  // with a real bcrypt-hashed password, distinct from prepareTestDb.ts's
  // own "userb" which is deliberately seeded as currently-suspended for an
  // unrelated moderation test - useful here specifically as the
  // "unavailable target/recipient" fixture, but unsuitable as an ordinary
  // messaging partner that needs to log in and block back.
  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create({
    username: PARTNER_USERNAME,
    email: PARTNER_EMAIL,
    password,
    role: "user",
    moderationStatus: "active",
  });
  await mongoose.disconnect();
});

// next dev (used by playwright.config.ts's webServer) forces
// process.env.NODE_ENV to "development" internally regardless of the
// NODE_ENV=test passed to it, so lib/rateLimitGuard.ts's test-mode bypass
// never actually engages here - login's real 10/min/IP limit is live
// during these runs. This file logs in far more densely than existing
// suites (~20 sequential tests), so a bounded retry-on-429 belongs here
// rather than weakening the real rate limit.
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

test("unauthenticated conversation list is rejected", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/messages/conversations");
  expect(res.status()).toBe(401);
  await api.dispose();
});

test("create conversation with a valid target succeeds", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(typeof json.conversation._id).toBe("string");

  await apiA.dispose();
});

test("same unordered pair reuses the same conversation regardless of who starts it", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const userAId = (await (await apiA.get("/api/me")).json()).user._id;

  const firstRes = await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } });
  const firstJson = await firstRes.json();

  const apiB = await loginAs(baseURL, PARTNER_EMAIL);
  const secondRes = await apiB.post("/api/messages/conversations", { data: { targetUserId: userAId } });
  const secondJson = await secondRes.json();

  expect(secondJson.conversation._id).toBe(firstJson.conversation._id);

  await apiA.dispose();
  await apiB.dispose();
});

test("self-target conversation creation is rejected", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = (await (await apiA.get("/api/me")).json()).user._id;

  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: userAId } });
  expect(res.status()).toBe(400);

  await apiA.dispose();
});

test("invalid target ID is rejected", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: "not-a-real-id" } });
  expect(res.status()).toBe(400);
  await apiA.dispose();
});

test("unavailable (suspended) target is rejected on creation", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userbId = (await (await apiA.get("/api/users/userb")).json()).user._id;

  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: userbId } });
  expect(res.status()).toBe(403);

  await apiA.dispose();
});

test("A blocking B prevents A from creating a conversation with B", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  await apiA.post("/api/relations", { data: { targetUserId: partnerId, relationType: "block" } });

  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } });
  expect(res.status()).toBe(403);

  await apiA.dispose();
});

test("B blocking A prevents A from creating a conversation with B", async ({ baseURL }) => {
  const apiB = await loginAs(baseURL, PARTNER_EMAIL);
  const apiA = await loginAs(baseURL, "usera@test.com");
  const userAId = (await (await apiA.get("/api/me")).json()).user._id;
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  await apiB.post("/api/relations", { data: { targetUserId: userAId, relationType: "block" } });

  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } });
  expect(res.status()).toBe(403);

  await apiA.dispose();
  await apiB.dispose();
});

test("mute does not prevent conversation creation", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  await apiA.post("/api/relations", { data: { targetUserId: partnerId, relationType: "mute" } });

  const res = await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } });
  expect(res.ok()).toBeTruthy();

  await apiA.dispose();
});

test("a participant can retrieve the conversation", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const res = await apiA.get(`/api/messages/conversations/${createJson.conversation._id}`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.counterpart.username).toBe(PARTNER_USERNAME);
  expect(Array.isArray(json.messages)).toBe(true);

  await apiA.dispose();
});

test("a non-participant cannot retrieve the conversation", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const apiOutsider = await loginAs(baseURL, "expert@test.com");
  const res = await apiOutsider.get(`/api/messages/conversations/${createJson.conversation._id}`);
  expect(res.status()).toBe(403);

  await apiA.dispose();
  await apiOutsider.dispose();
});

test("a participant can send a message", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const res = await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "Hello there" },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.message.content).toBe("Hello there");

  await apiA.dispose();
});

test("empty content is rejected", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const res = await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "   " },
  });
  expect(res.status()).toBe(400);

  await apiA.dispose();
});

test("oversized content is rejected", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const res = await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "x".repeat(2001) },
  });
  expect(res.status()).toBe(400);

  await apiA.dispose();
});

test("recipient becoming unavailable after creation prevents a later send", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  await User.updateOne(
    { _id: partnerId },
    { $set: { moderationStatus: "banned" } }
  );
  await mongoose.disconnect();

  const res = await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "still there?" },
  });
  expect(res.status()).toBe(403);

  await apiA.dispose();
});

test("a block in either direction after creation prevents a later send", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const apiB = await loginAs(baseURL, PARTNER_EMAIL);
  const userAId = (await (await apiA.get("/api/me")).json()).user._id;
  await apiB.post("/api/relations", { data: { targetUserId: userAId, relationType: "block" } });

  const res = await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "hello?" },
  });
  expect(res.status()).toBe(403);

  await apiA.dispose();
  await apiB.dispose();
});

test("mute does not prevent sending", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  await apiA.post("/api/relations", { data: { targetUserId: partnerId, relationType: "mute" } });

  const res = await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "muted but still allowed" },
  });
  expect(res.ok()).toBeTruthy();

  await apiA.dispose();
});

test("conversation metadata updates after a send", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "metadata check" },
  });

  const listJson = await (await apiA.get("/api/messages/conversations")).json();
  const conversation = listJson.conversations.find(
    (c: any) => c._id === createJson.conversation._id
  );
  expect(conversation.lastMessagePreview).toBe("metadata check");
  expect(conversation.lastMessageAt).toBeTruthy();

  await apiA.dispose();
});

test("list and detail responses are private/no-store with no shared-cache directives", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;
  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  const listRes = await apiA.get("/api/messages/conversations");
  const listCache = (listRes.headers()["cache-control"] || "").toLowerCase();
  expect(listCache).toContain("private");
  expect(listCache).toContain("no-store");
  expect(listCache).not.toContain("s-maxage");
  expect(listCache).not.toContain("stale-while-revalidate");

  const detailRes = await apiA.get(`/api/messages/conversations/${createJson.conversation._id}`);
  const detailCache = (detailRes.headers()["cache-control"] || "").toLowerCase();
  expect(detailCache).toContain("private");
  expect(detailCache).toContain("no-store");
  expect(detailCache).not.toContain("s-maxage");
  expect(detailCache).not.toContain("stale-while-revalidate");

  await apiA.dispose();
});

test("duplicate creation attempts for the same pair remain a single conversation", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  const firstJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();
  const secondJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  expect(secondJson.conversation._id).toBe(firstJson.conversation._id);

  const listJson = await (await apiA.get("/api/messages/conversations")).json();
  const matches = listJson.conversations.filter(
    (c: any) => c._id === firstJson.conversation._id
  );
  expect(matches.length).toBe(1);
  expect(listJson.conversations.length).toBe(1);

  await apiA.dispose();
});
