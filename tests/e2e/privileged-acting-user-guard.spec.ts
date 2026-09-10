import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import Post from "@/models/Post";

dotenv.config({ path: ".env.test.local" });

async function apiLogin(baseURL: string | undefined, email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", { data: { email, password } });
  const json = await res.json();
  return { api, userId: json.user?._id as string | undefined };
}

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

// admin1's login happens while active (login itself already correctly
// rejects banned/suspended/deactivated accounts - that's not what this
// phase is testing). Each scenario logs in first, then mutates the admin's
// DB record directly to simulate a moderation action taken *after* the
// admin already holds a valid session token - the exact bypass the audit
// found.
const adminStatusScenarios: Array<{
  name: string;
  applyStatus: () => Promise<void>;
  expectAllowed: boolean;
}> = [
  {
    name: "active admin",
    applyStatus: async () => {},
    expectAllowed: true,
  },
  {
    name: "warned admin",
    applyStatus: async () => {
      await User.updateOne({ username: "admin1" }, { moderationStatus: "warned" });
    },
    expectAllowed: true,
  },
  {
    name: "currently-suspended admin",
    applyStatus: async () => {
      await User.updateOne(
        { username: "admin1" },
        { moderationStatus: "suspended", suspendedUntil: new Date(Date.now() + 60 * 60 * 1000) }
      );
    },
    expectAllowed: false,
  },
  {
    name: "banned admin",
    applyStatus: async () => {
      await User.updateOne({ username: "admin1" }, { moderationStatus: "banned" });
    },
    expectAllowed: false,
  },
  {
    name: "deactivated admin",
    applyStatus: async () => {
      await User.updateOne({ username: "admin1" }, { isDeactivated: true });
    },
    expectAllowed: false,
  },
  {
    name: "expired-suspension admin",
    applyStatus: async () => {
      await User.updateOne(
        { username: "admin1" },
        { moderationStatus: "suspended", suspendedUntil: new Date(Date.now() - 60 * 60 * 1000) }
      );
    },
    expectAllowed: true,
  },
];

for (const scenario of adminStatusScenarios) {
  test(`admin/users PATCH: ${scenario.name} - privileged mutation ${scenario.expectAllowed ? "allowed" : "rejected 403"}`, async ({ baseURL }) => {
    const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");

    await mongoose.connect(process.env.MONGO_URI!);
    const usera = await User.findOne({ username: "usera" });
    await scenario.applyStatus();
    await mongoose.disconnect();

    const res = await api.patch(`/api/admin/users/${usera!._id}`, {
      data: { action: "warn" },
    });

    if (scenario.expectAllowed) {
      expect(res.ok(), `expected success for ${scenario.name}`).toBeTruthy();
    } else {
      expect(res.status(), `expected 403 for ${scenario.name}`).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
    }

    await api.dispose();
  });
}

test("admin/users PATCH: a non-admin user still cannot access admin mutation", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  const userb = await User.findOne({ username: "userb" });
  await mongoose.disconnect();

  const res = await api.patch(`/api/admin/users/${userb!._id}`, {
    data: { action: "warn" },
  });
  expect(res.status()).toBe(403);
  const json = await res.json();
  expect(json.message).toBe("Admin access required");

  await api.dispose();
});

test("expert/review PATCH: an active expert reaches existing review behavior", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const post = await Post.create({
    author: usera!._id,
    content: "A post requiring expert review for the acting-user guard test.",
    status: "under_expert_review",
    aiLabel: "needs_review",
    needsExpertReview: true,
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "expert@test.com", "Password123!");
  const res = await api.patch(`/api/expert/review/${post._id}`, {
    data: { decision: "verified" },
  });
  expect(res.ok()).toBeTruthy();

  await api.dispose();
});

test("expert/review PATCH: a banned expert cannot perform review", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const post = await Post.create({
    author: usera!._id,
    content: "Another post requiring expert review for the acting-user guard test.",
    status: "under_expert_review",
    aiLabel: "needs_review",
    needsExpertReview: true,
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "expert@test.com", "Password123!");

  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "expert1" }, { moderationStatus: "banned" });
  await mongoose.disconnect();

  const res = await api.patch(`/api/expert/review/${post._id}`, {
    data: { decision: "verified" },
  });
  expect(res.status()).toBe(403);
  const json = await res.json();
  expect(json.success).toBe(false);

  await api.dispose();
});

test("expert/review PATCH: a non-expert, non-admin user still cannot perform review", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  const post = await Post.create({
    author: usera!._id,
    content: "A third post requiring expert review for the acting-user guard test.",
    status: "under_expert_review",
    aiLabel: "needs_review",
    needsExpertReview: true,
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");
  const res = await api.patch(`/api/expert/review/${post._id}`, {
    data: { decision: "verified" },
  });
  expect(res.status()).toBe(403);
  const json = await res.json();
  expect(json.message).toBe("Expert or admin access required");

  await api.dispose();
});
