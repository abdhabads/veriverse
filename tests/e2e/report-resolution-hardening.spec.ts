import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";
import Report from "@/models/Report";
import AuditLog from "@/models/AuditLog";
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
  const password = await bcrypt.hash("Password123!", 10);

  // Created active - the stale-JWT test bans this account out-of-band
  // *after* logging in, since /api/login already rejects banned accounts
  // outright and would never issue a token for an already-banned account.
  await User.create({
    username: "resolveadminf2",
    email: "resolveadminf2@test.com",
    password,
    role: "admin",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 50,
    rewardPoints: 100,
  });

  const reporter = await User.create({
    username: "reporterf2",
    email: "reporterf2@test.com",
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 10,
    rewardPoints: 10,
  });

  const postAuthor = await User.create({
    username: "reportedauthorf2",
    email: "reportedauthorf2@test.com",
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 10,
    rewardPoints: 10,
  });

  const targetPost = await Post.create({
    author: postAuthor._id,
    content: "F2 test target post for report resolution.",
    status: "unverified",
    aiLabel: "safe",
  });

  await Report.create({
    reporter: reporter._id,
    post: targetPost._id,
    reason: "spam",
    status: "pending",
  });

  await mongoose.disconnect();
});

test("stale-JWT unavailable admin cannot list reports", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "resolveadminf2@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  const bannedAdmin = await User.findOne({ username: "resolveadminf2" });
  await User.updateOne(
    { _id: bannedAdmin!._id },
    { $set: { moderationStatus: "banned" } }
  );
  await mongoose.disconnect();

  const res = await api.get("/api/admin/reports");
  expect(res.status()).toBe(403);

  await api.dispose();
});

test("active admin can dismiss a pending report", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const report = await Report.findOne({ status: "pending" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");

  const res = await api.patch(`/api/admin/reports/${report!._id}`, {
    data: { action: "dismiss" },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const updatedReport = await Report.findById(report!._id);
  expect(updatedReport!.status).toBe("dismissed");

  const auditCount = await AuditLog.countDocuments({
    targetReport: report!._id,
    actionType: "report_dismiss",
  });
  expect(auditCount).toBe(1);

  const notificationCount = await Notification.countDocuments({
    user: updatedReport!.reporter,
    type: "report_update",
  });
  expect(notificationCount).toBe(1);
  await mongoose.disconnect();

  await api.dispose();
});

test("active admin can flag a pending report's post", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const report = await Report.findOne({ status: "pending" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");

  const res = await api.patch(`/api/admin/reports/${report!._id}`, {
    data: { action: "flag_post" },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const updatedReport = await Report.findById(report!._id);
  expect(updatedReport!.status).toBe("reviewed");

  const updatedPost = await Post.findById(report!.post);
  expect(updatedPost!.status).toBe("flagged");

  const auditCount = await AuditLog.countDocuments({
    targetReport: report!._id,
    actionType: "report_flag_post",
  });
  expect(auditCount).toBe(1);

  const notificationCount = await Notification.countDocuments({
    user: updatedReport!.reporter,
    type: "report_update",
  });
  expect(notificationCount).toBe(1);
  await mongoose.disconnect();

  await api.dispose();
});

test("an already-resolved report cannot be resolved again", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const report = await Report.findOne({ status: "pending" });
  const reportId = String(report!._id);
  const postId = String(report!.post);
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");

  const firstRes = await api.patch(`/api/admin/reports/${reportId}`, {
    data: { action: "dismiss" },
  });
  expect(firstRes.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const auditCountAfterFirst = await AuditLog.countDocuments({ targetReport: reportId });
  const notificationCountAfterFirst = await Notification.countDocuments({});
  await mongoose.disconnect();

  const secondRes = await api.patch(`/api/admin/reports/${reportId}`, {
    data: { action: "dismiss" },
  });
  expect(secondRes.status()).toBe(409);

  await mongoose.connect(process.env.MONGO_URI!);
  const finalReport = await Report.findById(reportId);
  expect(finalReport!.status).toBe("dismissed");

  const finalPost = await Post.findById(postId);
  expect(finalPost!.status).toBe("unverified");

  const auditCountAfterSecond = await AuditLog.countDocuments({ targetReport: reportId });
  expect(auditCountAfterSecond).toBe(auditCountAfterFirst);

  const notificationCountAfterSecond = await Notification.countDocuments({});
  expect(notificationCountAfterSecond).toBe(notificationCountAfterFirst);
  await mongoose.disconnect();

  await api.dispose();
});
