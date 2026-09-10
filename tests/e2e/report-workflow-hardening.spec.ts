import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import Report from "@/models/Report";

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
  const password = await bcrypt.hash("Password123!", 10);

  const postAuthor = await User.create({
    username: "reportpostauthorf1",
    email: "reportpostauthorf1@test.com",
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 10,
    rewardPoints: 10,
  });

  // Created active, not banned - the "unavailable acting user" test bans
  // this account out-of-band *after* logging in, to reach the account
  // through a still-valid session rather than through /api/login (which
  // now rejects banned accounts outright and would never issue a token).
  await User.create({
    username: "reportbannedf1",
    email: "reportbannedf1@test.com",
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 10,
    rewardPoints: 10,
  });

  await Post.create({
    author: postAuthor._id,
    content: "F1 test target post for reporting.",
    status: "unverified",
    aiLabel: "safe",
  });

  await mongoose.disconnect();
});

test("active ordinary user can report another user's post", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const targetPost = await Post.findOne({ content: "F1 test target post for reporting." });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const res = await api.post("/api/reports", {
    data: { postId: String(targetPost!._id), reason: "spam" },
  });
  expect(res.status()).toBe(201);

  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const count = await Report.countDocuments({
    reporter: usera!._id,
    post: targetPost!._id,
  });
  expect(count).toBe(1);
  await mongoose.disconnect();

  await api.dispose();
});

test("unavailable acting user cannot submit report", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const targetPost = await Post.findOne({ content: "F1 test target post for reporting." });
  await mongoose.disconnect();

  // Log in while the account is still active (so a valid session/JWT is
  // issued), then ban the account out-of-band - simulating a moderator
  // action taken after the JWT was already handed out. This is the same
  // stale-JWT threat model requireActiveUser was built to close in P1.9-B2;
  // a banned account can no longer complete /api/login at all (login itself
  // now rejects banned accounts at 403), so that path can't be used to reach
  // this check.
  const { api } = await apiLogin(baseURL, "reportbannedf1@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  const bannedUser = await User.findOne({ username: "reportbannedf1" });
  await User.updateOne(
    { _id: bannedUser!._id },
    { $set: { moderationStatus: "banned" } }
  );
  await mongoose.disconnect();

  const res = await api.post("/api/reports", {
    data: { postId: String(targetPost!._id), reason: "spam" },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const count = await Report.countDocuments({ reporter: bannedUser!._id });
  expect(count).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("self-report is rejected", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const targetPost = await Post.findOne({ content: "F1 test target post for reporting." });
  const postAuthor = await User.findOne({ username: "reportpostauthorf1" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "reportpostauthorf1@test.com", "Password123!");

  const res = await api.post("/api/reports", {
    data: { postId: String(targetPost!._id), reason: "other" },
  });
  expect(res.status()).toBe(400);

  await mongoose.connect(process.env.MONGO_URI!);
  const count = await Report.countDocuments({
    reporter: postAuthor!._id,
    post: targetPost!._id,
  });
  expect(count).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("concurrent duplicate reports are handled deterministically", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const targetPost = await Post.findOne({ content: "F1 test target post for reporting." });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const [resA, resB] = await Promise.all([
    api.post("/api/reports", {
      data: { postId: String(targetPost!._id), reason: "spam" },
    }),
    api.post("/api/reports", {
      data: { postId: String(targetPost!._id), reason: "spam" },
    }),
  ]);

  const statuses = [resA.status(), resB.status()].sort();
  expect(statuses).toEqual([201, 409]);
  expect(statuses).not.toContain(500);

  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const count = await Report.countDocuments({
    reporter: usera!._id,
    post: targetPost!._id,
  });
  expect(count).toBe(1);
  await mongoose.disconnect();

  await api.dispose();
});
