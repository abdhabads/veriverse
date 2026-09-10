import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";

dotenv.config({ path: ".env.test.local" });

const PARTNER_EMAIL = "loopspartner@test.com";
const PARTNER_USERNAME = "loopspartner";

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create({
    username: PARTNER_USERNAME,
    email: PARTNER_EMAIL,
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
  });
  await mongoose.disconnect();
});

// Mirrors messages-api.spec.ts's loginAs: next dev forces NODE_ENV to
// "development" internally, so lib/rateLimitGuard.ts's test-mode bypass
// never engages here - login's real 10/min/IP limit is live during these
// runs, and this file logs in repeatedly across sequential tests.
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

test("conversation list reports unread state and a bounded unread count correctly", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  // No messages yet: not unread for either side.
  const beforeList = await (await apiA.get("/api/messages/conversations")).json();
  const beforeConversation = beforeList.conversations.find(
    (c: any) => c._id === createJson.conversation._id
  );
  expect(beforeConversation.isUnread).toBe(false);
  expect(beforeList.unreadCount).toBe(0);

  await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "hello" },
  });

  // Sender: sending marks their own lastReadAt, so still not unread for them.
  const afterSendAsSender = await (await apiA.get("/api/messages/conversations")).json();
  const senderView = afterSendAsSender.conversations.find(
    (c: any) => c._id === createJson.conversation._id
  );
  expect(senderView.isUnread).toBe(false);

  // Recipient: has a new message they haven't read yet.
  const apiB = await loginAs(baseURL, PARTNER_EMAIL);
  const recipientList = await (await apiB.get("/api/messages/conversations")).json();
  const recipientView = recipientList.conversations.find(
    (c: any) => c._id === createJson.conversation._id
  );
  expect(recipientView.isUnread).toBe(true);
  expect(recipientList.unreadCount).toBe(1);

  await apiA.dispose();
  await apiB.dispose();
});

test("opening a conversation clears unread state for that participant only", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "unread check" },
  });

  const apiB = await loginAs(baseURL, PARTNER_EMAIL);

  const beforeOpen = await (await apiB.get("/api/messages/conversations")).json();
  expect(
    beforeOpen.conversations.find((c: any) => c._id === createJson.conversation._id).isUnread
  ).toBe(true);

  // Opening the conversation (the detail GET) marks it read for B.
  await apiB.get(`/api/messages/conversations/${createJson.conversation._id}`);

  const afterOpen = await (await apiB.get("/api/messages/conversations")).json();
  expect(
    afterOpen.conversations.find((c: any) => c._id === createJson.conversation._id).isUnread
  ).toBe(false);

  await apiA.dispose();
  await apiB.dispose();
});

test("sending a message creates a message_received notification for the recipient only, linked to the conversation", async ({ baseURL }) => {
  const apiA = await loginAs(baseURL, "usera@test.com");
  const partnerId = (await (await apiA.get("/api/users/" + PARTNER_USERNAME)).json()).user._id;

  const createJson = await (
    await apiA.post("/api/messages/conversations", { data: { targetUserId: partnerId } })
  ).json();

  await apiA.post(`/api/messages/conversations/${createJson.conversation._id}`, {
    data: { content: "notify me" },
  });

  // Sender receives no notification for their own message.
  const senderNotifications = await (await apiA.get("/api/notifications")).json();
  expect(
    senderNotifications.notifications.some((n: any) => n.type === "message_received")
  ).toBe(false);

  // Recipient receives exactly one, referencing the right conversation, with
  // safe generic text (no message content copied into the notification).
  const apiB = await loginAs(baseURL, PARTNER_EMAIL);
  const recipientNotifications = await (await apiB.get("/api/notifications")).json();
  const messageNotifications = recipientNotifications.notifications.filter(
    (n: any) => n.type === "message_received"
  );
  expect(messageNotifications.length).toBe(1);
  expect(messageNotifications[0].referenceConversation).toBe(createJson.conversation._id);
  expect(messageNotifications[0].message).toContain("usera");
  expect(messageNotifications[0].message).not.toContain("notify me");

  await apiA.dispose();
  await apiB.dispose();
});
