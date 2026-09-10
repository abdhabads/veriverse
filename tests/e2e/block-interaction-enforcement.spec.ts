import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import Comment from "@/models/Comment";
import Repost from "@/models/Repost";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import Notification from "@/models/Notification";

dotenv.config({ path: ".env.test.local" });

async function apiLogin(baseURL: string | undefined, email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", { data: { email, password } });
  const json = await res.json();
  return { api, userId: json.user?._id as string | undefined };
}

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const seededCreatedAt = new Date(Date.now() - 10 * 60 * 1000);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create([
    {
      username: "blocka",
      email: "blocka@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 10,
      rewardPoints: 5,
      createdAt: seededCreatedAt,
    },
    {
      username: "blockb",
      email: "blockb@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 10,
      rewardPoints: 5,
      createdAt: seededCreatedAt,
    },
    {
      username: "blockc",
      email: "blockc@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 10,
      rewardPoints: 5,
      createdAt: seededCreatedAt,
    },
  ]);
  await mongoose.disconnect();
});

test("a blocked user cannot comment on the blocker's post", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const a = await User.findOne({ username: "blocka" });
  const b = await User.findOne({ username: "blockb" });
  const post = await Post.create({
    author: a!._id,
    content: "A post from blocka.",
    status: "unverified",
    aiLabel: "safe",
  });
  await UserRelation.create({ sourceUser: a!._id, targetUser: b!._id, relationType: "block" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "blockb@test.com", "Password123!");
  const res = await api.post(`/api/posts/${post._id}/comments`, {
    data: { content: "Trying to comment despite the block." },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const comments = await Comment.find({ post: post._id });
  expect(comments.length).toBe(0);
  const notifs = await Notification.find({ user: a!._id, type: "comment_received", referencePost: post._id });
  expect(notifs.length).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("a blocked pair cannot reply directly to each other's comment", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const a = await User.findOne({ username: "blocka" });
  const b = await User.findOne({ username: "blockb" });
  const c = await User.findOne({ username: "blockc" });
  // Post authored by an unrelated third party - the post-author gate must
  // pass, isolating this test to the parent-comment-author gate.
  const post = await Post.create({
    author: c!._id,
    content: "A neutral post from blockc.",
    status: "unverified",
    aiLabel: "safe",
  });
  const parentComment = await Comment.create({
    post: post._id,
    author: a!._id,
    content: "blocka's top-level comment.",
  });
  await UserRelation.create({ sourceUser: a!._id, targetUser: b!._id, relationType: "block" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "blockb@test.com", "Password123!");
  const res = await api.post(`/api/posts/${post._id}/comments`, {
    data: { content: "Trying to reply despite the block.", parentComment: String(parentComment._id) },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const replies = await Comment.find({ parentComment: parentComment._id });
  expect(replies.length).toBe(0);
  const notifs = await Notification.find({ user: a!._id, type: "comment_received", referencePost: post._id });
  expect(notifs.length).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("a blocked user cannot create a new repost of the blocker's post", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const a = await User.findOne({ username: "blocka" });
  const b = await User.findOne({ username: "blockb" });
  const post = await Post.create({
    author: a!._id,
    content: "A post from blocka to be reposted.",
    status: "unverified",
    aiLabel: "safe",
  });
  await UserRelation.create({ sourceUser: a!._id, targetUser: b!._id, relationType: "block" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "blockb@test.com", "Password123!");
  const res = await api.post("/api/repost", { data: { postId: String(post._id) } });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const reposts = await Repost.find({ post: post._id });
  expect(reposts.length).toBe(0);
  const notifs = await Notification.find({ user: a!._id, type: "repost_received", referencePost: post._id });
  expect(notifs.length).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("an otherwise-valid comment mentioning a blocked unrelated third party succeeds, but that party gets no notification", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const a = await User.findOne({ username: "blocka" });
  const b = await User.findOne({ username: "blockb" });
  const c = await User.findOne({ username: "blockc" });
  const post = await Post.create({
    author: b!._id,
    content: "blockb's post, unrelated to any block.",
    status: "unverified",
    aiLabel: "safe",
  });
  // blocka blocks blockc, who is mentioned incidentally, not addressed.
  await UserRelation.create({ sourceUser: a!._id, targetUser: c!._id, relationType: "block" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "blocka@test.com", "Password123!");
  const res = await api.post(`/api/posts/${post._id}/comments`, {
    data: { content: "Great point, @blockc should see this too." },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const comments = await Comment.find({ post: post._id });
  expect(comments.length).toBe(1);

  const postAuthorNotifs = await Notification.find({ user: b!._id, type: "comment_received", referencePost: post._id });
  expect(postAuthorNotifs.length).toBe(1);

  const mentionedNotifs = await Notification.find({ user: c!._id, type: "comment_received", referencePost: post._id });
  expect(mentionedNotifs.length).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("creating a Block removes pre-existing Follow edges in both directions", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const a = await User.findOne({ username: "blocka" });
  const b = await User.findOne({ username: "blockb" });
  await Follow.create([
    { follower: a!._id, following: b!._id },
    { follower: b!._id, following: a!._id },
  ]);
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "blocka@test.com", "Password123!");
  const res = await api.post("/api/relations", {
    data: { targetUserId: String(b!._id), relationType: "block" },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const edges = await Follow.find({
    $or: [
      { follower: a!._id, following: b!._id },
      { follower: b!._id, following: a!._id },
    ],
  });
  expect(edges.length).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("malformed targetUserId on POST /api/relations returns 400, not 500", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "blocka@test.com", "Password123!");
  const res = await api.post("/api/relations", {
    data: { targetUserId: "not-a-valid-object-id", relationType: "block" },
  });
  expect(res.status()).toBe(400);

  await api.dispose();
});
