import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create([
    {
      username: "deactivatedauth",
      email: "deactivatedauth@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      isDeactivated: true,
      deactivatedAt: new Date(Date.now() - 60 * 60 * 1000),
      deletionEligibleAt: new Date(Date.now() + 23 * 60 * 60 * 1000),
    },
    {
      username: "bannedrestoreauth",
      email: "bannedrestoreauth@test.com",
      password,
      role: "user",
      moderationStatus: "banned",
      isDeactivated: true,
      deactivatedAt: new Date(Date.now() - 60 * 60 * 1000),
      deletionEligibleAt: new Date(Date.now() + 23 * 60 * 60 * 1000),
    },
    {
      username: "eligiblerestoreauth",
      email: "eligiblerestoreauth@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      isDeactivated: true,
      deactivatedAt: new Date(Date.now() - 60 * 60 * 1000),
      deletionEligibleAt: new Date(Date.now() + 23 * 60 * 60 * 1000),
    },
  ]);
  await mongoose.disconnect();
});

test("login: nonexistent email and existing-active-wrong-password return the same generic response", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });

  const nonexistentRes = await api.post("/api/login", {
    data: { email: "nobody-at-all@test.com", password: "whatever123" },
  });
  const wrongPasswordRes = await api.post("/api/login", {
    data: { email: "usera@test.com", password: "definitely-wrong" },
  });

  expect(nonexistentRes.status()).toBe(401);
  expect(wrongPasswordRes.status()).toBe(401);

  const nonexistentJson = await nonexistentRes.json();
  const wrongPasswordJson = await wrongPasswordRes.json();
  expect(nonexistentJson.message).toBe(wrongPasswordJson.message);
  expect(nonexistentJson.message).toBe("Invalid credentials");

  await api.dispose();
});

test("login: deactivated account with wrong password returns the generic failure, not the deactivated message", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", {
    data: { email: "deactivatedauth@test.com", password: "definitely-wrong" },
  });
  expect(res.status()).toBe(401);
  const json = await res.json();
  expect(json.message).toBe("Invalid credentials");

  await api.dispose();
});

test("login: deactivated account with the correct password still receives the deactivated-specific response", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", {
    data: { email: "deactivatedauth@test.com", password: "Password123!" },
  });
  expect(res.status()).toBe(403);
  const json = await res.json();
  expect(json.message).toContain("deactivated");

  await api.dispose();
});

test("restore: nonexistent email and existing-active-wrong-password return the same generic response, never 'not deactivated'", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });

  const nonexistentRes = await api.post("/api/profile/account/restore", {
    data: { email: "nobody-at-all@test.com", password: "whatever123" },
  });
  const wrongPasswordRes = await api.post("/api/profile/account/restore", {
    data: { email: "usera@test.com", password: "definitely-wrong" },
  });

  expect(nonexistentRes.status()).toBe(401);
  expect(wrongPasswordRes.status()).toBe(401);

  const nonexistentJson = await nonexistentRes.json();
  const wrongPasswordJson = await wrongPasswordRes.json();
  expect(nonexistentJson.message).toBe(wrongPasswordJson.message);
  expect(wrongPasswordJson.message).not.toContain("not deactivated");

  await api.dispose();
});

test("restore: deactivated+banned account with wrong password returns the generic failure, not the banned message", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/profile/account/restore", {
    data: { email: "bannedrestoreauth@test.com", password: "definitely-wrong" },
  });
  expect(res.status()).toBe(401);
  const json = await res.json();
  expect(json.message).not.toContain("banned");

  await api.dispose();
});

test("restore: eligible deactivated account with the correct password still succeeds", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/profile/account/restore", {
    data: { email: "eligiblerestoreauth@test.com", password: "Password123!" },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const restored = await User.findOne({ username: "eligiblerestoreauth" });
  expect(restored!.isDeactivated).toBe(false);
  await mongoose.disconnect();

  await api.dispose();
});
