import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";

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
  // A second admin account distinct from prepareTestDb's own admin1, so
  // admin1 can act as Admin A against a genuinely different Admin B.
  await User.create({
    username: "admin2",
    email: "admin2@test.com",
    password,
    role: "admin",
    moderationStatus: "active",
    onboardingCompleted: true,
    reputation: 50,
    rewardPoints: 100,
    createdAt: seededCreatedAt,
  });
  await mongoose.disconnect();
});

test("Admin A cannot demote Admin B to user", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const admin2 = await User.findOne({ username: "admin2" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${admin2!._id}`, {
    data: { action: "set_role", role: "user" },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(admin2!._id);
  expect(reloaded!.role).toBe("admin");

  const auditRows = await AuditLog.find({
    targetUser: admin2!._id,
    actionType: "admin_role_assigned",
  });
  expect(auditRows.length).toBe(0);
  await mongoose.disconnect();

  await api.dispose();
});

test("Admin A cannot change Admin B to expert", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const admin2 = await User.findOne({ username: "admin2" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${admin2!._id}`, {
    data: { action: "set_role", role: "expert" },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(admin2!._id);
  expect(reloaded!.role).toBe("admin");
  await mongoose.disconnect();

  await api.dispose();
});

test("Admin A still cannot warn Admin B", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const admin2 = await User.findOne({ username: "admin2" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${admin2!._id}`, {
    data: { action: "warn" },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(admin2!._id);
  expect(reloaded!.moderationStatus).toBe("active");
  await mongoose.disconnect();

  await api.dispose();
});

test("Admin can change a non-admin target's role", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${usera!._id}`, {
    data: { action: "set_role", role: "expert" },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(usera!._id);
  expect(reloaded!.role).toBe("expert");
  await mongoose.disconnect();

  await api.dispose();
});

test("Admin cannot change their own role", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const admin1 = await User.findOne({ username: "admin1" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${admin1!._id}`, {
    data: { action: "set_role", role: "user" },
  });
  expect(res.status()).toBe(400);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(admin1!._id);
  expect(reloaded!.role).toBe("admin");
  await mongoose.disconnect();

  await api.dispose();
});
