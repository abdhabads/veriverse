import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import Notification from "@/models/Notification";
import { buildParticipantKey, sortParticipantPair } from "@/lib/messaging";

dotenv.config({ path: ".env.test.local" });

async function apiLogin(baseURL: string | undefined, email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", { data: { email, password } });
  const json = await res.json();
  return { api, userId: json.user?._id as string | undefined };
}

// Mirrors the deletion route's own cooling-off requirement: the account
// must already be deactivated, with deactivatedAt more than 24h in the
// past, before DELETE /api/profile/account will proceed.
async function makeEligibleForDeletion(username: string) {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne(
    { username },
    {
      isDeactivated: true,
      deactivatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      deletionEligibleAt: new Date(Date.now() - 60 * 60 * 1000),
    }
  );
  await mongoose.disconnect();
}

async function createUser(username: string, password: string) {
  return User.create({
    username,
    email: `${username}@test.com`,
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 10,
    rewardPoints: 10,
  });
}

async function createConversation(userIdA: string, userIdB: string) {
  const participantKey = buildParticipantKey(userIdA, userIdB);
  const [a, b] = sortParticipantPair(userIdA, userIdB);
  return Conversation.create({
    participants: [a, b],
    participantKey,
    participantState: [
      { user: a, lastReadAt: null },
      { user: b, lastReadAt: null },
    ],
    lastMessageAt: null,
    lastMessagePreview: "",
  });
}

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

test("permanently deleting an account deletes the Conversation it participated in", async ({ baseURL }) => {
  const password = await bcrypt.hash("Password123!", 10);
  await mongoose.connect(process.env.MONGO_URI!);
  const deletingUser = await createUser("g1deleting", password);
  const survivingUser = await createUser("g1surviving", password);
  const conversation = await createConversation(String(deletingUser._id), String(survivingUser._id));
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "g1deleting@test.com", "Password123!");
  await makeEligibleForDeletion("g1deleting");

  const res = await api.delete("/api/profile/account", { data: { password: "Password123!" } });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const foundConversation = await Conversation.findById(conversation._id);
  expect(foundConversation).toBeNull();
  await mongoose.disconnect();

  await api.dispose();
});

test("permanently deleting an account deletes both sides' Messages in that Conversation", async ({ baseURL }) => {
  const password = await bcrypt.hash("Password123!", 10);
  await mongoose.connect(process.env.MONGO_URI!);
  const deletingUser = await createUser("g2deleting", password);
  const survivingUser = await createUser("g2surviving", password);
  const conversation = await createConversation(String(deletingUser._id), String(survivingUser._id));
  await Message.create([
    { conversation: conversation._id, sender: deletingUser._id, content: "Hello from the deleting user." },
    { conversation: conversation._id, sender: survivingUser._id, content: "Reply from the surviving user." },
  ]);
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "g2deleting@test.com", "Password123!");
  await makeEligibleForDeletion("g2deleting");

  const res = await api.delete("/api/profile/account", { data: { password: "Password123!" } });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const remainingMessages = await Message.countDocuments({ conversation: conversation._id });
  expect(remainingMessages).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("permanently deleting an account deletes conversation-linked Notifications but keeps unrelated ones", async ({ baseURL }) => {
  const password = await bcrypt.hash("Password123!", 10);
  await mongoose.connect(process.env.MONGO_URI!);
  const deletingUser = await createUser("g3deleting", password);
  const survivingUser = await createUser("g3surviving", password);
  const conversation = await createConversation(String(deletingUser._id), String(survivingUser._id));

  const linkedNotification = await Notification.create({
    user: survivingUser._id,
    type: "message_received",
    message: "You received a new message from g3deleting",
    referenceConversation: conversation._id,
  });
  const unrelatedNotification = await Notification.create({
    user: survivingUser._id,
    type: "report_update",
    message: "Your account role has been updated to user.",
    referenceConversation: null,
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "g3deleting@test.com", "Password123!");
  await makeEligibleForDeletion("g3deleting");

  const res = await api.delete("/api/profile/account", { data: { password: "Password123!" } });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const foundLinked = await Notification.findById(linkedNotification._id);
  expect(foundLinked).toBeNull();

  const foundUnrelated = await Notification.findById(unrelatedNotification._id);
  expect(foundUnrelated).not.toBeNull();
  await mongoose.disconnect();

  await api.dispose();
});

test("surviving participant's messaging API no longer surfaces the destroyed Conversation", async ({ baseURL }) => {
  const password = await bcrypt.hash("Password123!", 10);
  await mongoose.connect(process.env.MONGO_URI!);
  const deletingUser = await createUser("g4deleting", password);
  const survivingUser = await createUser("g4surviving", password);
  const conversation = await createConversation(String(deletingUser._id), String(survivingUser._id));
  await Message.create({
    conversation: conversation._id,
    sender: deletingUser._id,
    content: "This will be destroyed along with the conversation.",
  });
  await mongoose.disconnect();

  const { api: deletingApi } = await apiLogin(baseURL, "g4deleting@test.com", "Password123!");
  await makeEligibleForDeletion("g4deleting");

  const deleteRes = await deletingApi.delete("/api/profile/account", { data: { password: "Password123!" } });
  expect(deleteRes.ok()).toBeTruthy();
  await deletingApi.dispose();

  const { api: survivingApi } = await apiLogin(baseURL, "g4surviving@test.com", "Password123!");

  const listRes = await survivingApi.get("/api/messages/conversations");
  expect(listRes.ok()).toBeTruthy();
  const listJson = await listRes.json();
  const stillListed = (listJson.conversations || []).some(
    (item: any) => String(item._id) === String(conversation._id)
  );
  expect(stillListed).toBe(false);

  const detailRes = await survivingApi.get(`/api/messages/conversations/${conversation._id}`);
  expect(detailRes.status()).toBe(404);
  const detailJson = await detailRes.json();
  expect(detailJson.message).toBe("Conversation not found");

  await survivingApi.dispose();
});

test("deleting one account does not touch an unrelated Conversation, its Messages, or its Notifications", async ({ baseURL }) => {
  const password = await bcrypt.hash("Password123!", 10);
  await mongoose.connect(process.env.MONGO_URI!);
  const deletingUser = await createUser("g5deleting", password);
  const deletingCounterpart = await createUser("g5deletingcounterpart", password);
  const ownConversation = await createConversation(String(deletingUser._id), String(deletingCounterpart._id));

  const otherUserA = await createUser("g5othera", password);
  const otherUserB = await createUser("g5otherb", password);
  const unrelatedConversation = await createConversation(String(otherUserA._id), String(otherUserB._id));
  const unrelatedMessage = await Message.create({
    conversation: unrelatedConversation._id,
    sender: otherUserA._id,
    content: "This conversation must survive.",
  });
  const unrelatedNotification = await Notification.create({
    user: otherUserB._id,
    type: "message_received",
    message: "You received a new message from g5othera",
    referenceConversation: unrelatedConversation._id,
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "g5deleting@test.com", "Password123!");
  await makeEligibleForDeletion("g5deleting");

  const res = await api.delete("/api/profile/account", { data: { password: "Password123!" } });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const foundOwnConversation = await Conversation.findById(ownConversation._id);
  expect(foundOwnConversation).toBeNull();

  const foundUnrelatedConversation = await Conversation.findById(unrelatedConversation._id);
  expect(foundUnrelatedConversation).not.toBeNull();

  const foundUnrelatedMessage = await Message.findById(unrelatedMessage._id);
  expect(foundUnrelatedMessage).not.toBeNull();

  const foundUnrelatedNotification = await Notification.findById(unrelatedNotification._id);
  expect(foundUnrelatedNotification).not.toBeNull();
  await mongoose.disconnect();

  await api.dispose();
});
