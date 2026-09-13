import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { login } from "./helpers";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import ReputationLog from "@/models/ReputationLog";
import RewardLog from "@/models/RewardLog";
import TrustEvent from "@/models/TrustEvent";
import Claim from "@/models/Claim";
import { findOrCreateClaim } from "@/lib/claimIdentity";

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

// ---------------------------------------------------------------------------
// Admin mutation: set_expertise
// ---------------------------------------------------------------------------

test("an ordinary (non-admin) user cannot call set_expertise, even on themselves", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${usera!._id}`, {
    data: { action: "set_expertise", expertiseDomains: ["medical"], credentialSummary: "Self-certified" },
  });
  expect(res.status()).toBe(403);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(usera!._id);
  expect(reloaded!.expertiseDomains).toEqual([]);
  await mongoose.disconnect();
  await api.dispose();
});

test("an expert-role (non-admin) user cannot self-certify their own expertise domains", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const expert = await User.findOne({ username: "expert1" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "expert@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${expert!._id}`, {
    data: { action: "set_expertise", expertiseDomains: ["medical"], credentialSummary: "Trust me" },
  });
  expect(res.status()).toBe(403);
  await api.dispose();
});

test("admin can assign expertise domains and a credential summary to an expert-role user", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const expert = await User.findOne({ username: "expert1" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${expert!._id}`, {
    data: {
      action: "set_expertise",
      expertiseDomains: ["medical", "scientific"],
      credentialSummary: "Practicing physician, 12 years.",
    },
  });
  expect(res.ok()).toBeTruthy();

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(expert!._id);
  expect(reloaded!.expertiseDomains).toEqual(["medical", "scientific"]);
  expect(reloaded!.expertCredentialSummary).toBe("Practicing physician, 12 years.");

  const auditRows = await AuditLog.find({ targetUser: expert!._id, actionType: "admin_expertise_assigned" });
  expect(auditRows.length).toBe(1);
  await mongoose.disconnect();
  await api.dispose();
});

test("admin cannot assign expertise domains to a user without the expert role", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const usera = await User.findOne({ username: "usera" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${usera!._id}`, {
    data: { action: "set_expertise", expertiseDomains: ["medical"], credentialSummary: "" },
  });
  expect(res.status()).toBe(400);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(usera!._id);
  expect(reloaded!.expertiseDomains).toEqual([]);
  await mongoose.disconnect();
  await api.dispose();
});

test("an invalid expertise domain is rejected and leaves the target unchanged", async ({ baseURL }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const expert = await User.findOne({ username: "expert1" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${expert!._id}`, {
    data: { action: "set_expertise", expertiseDomains: ["astrology"], credentialSummary: "" },
  });
  expect(res.status()).toBe(400);

  await mongoose.connect(process.env.MONGO_URI!);
  const reloaded = await User.findById(expert!._id);
  expect(reloaded!.expertiseDomains).toEqual([]);
  await mongoose.disconnect();
  await api.dispose();
});

test("admin-vs-admin protection (P1.9) is preserved for set_expertise", async ({ baseURL }) => {
  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  // The admin-vs-admin guard fires unconditionally for any action once the
  // target is found to be an admin - before the route even inspects which
  // action was requested - so admin2 only needs role:"admin" here.
  const admin2 = await User.create({
    username: "admin2",
    email: "admin2@test.com",
    password,
    role: "admin",
    moderationStatus: "active",
    onboardingCompleted: true,
  });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${admin2._id}`, {
    data: { action: "set_expertise", expertiseDomains: ["medical"], credentialSummary: "" },
  });
  expect(res.status()).toBe(403);
  await api.dispose();
});

// ---------------------------------------------------------------------------
// Trust-pipeline isolation
// ---------------------------------------------------------------------------

test("assigning expert domains does not alter any Claim, or create any settlement-ledger entries", async ({
  baseURL,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const { claim } = await findOrCreateClaim(`Expert-isolation test claim ${new mongoose.Types.ObjectId()}`);
  const claimSnapshotBefore = claim.toObject();

  const [reputationBefore, rewardBefore, trustEventBefore] = await Promise.all([
    ReputationLog.countDocuments({}),
    RewardLog.countDocuments({}),
    TrustEvent.countDocuments({}),
  ]);

  const expert = await User.findOne({ username: "expert1" });
  await mongoose.disconnect();

  const { api } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const res = await api.patch(`/api/admin/users/${expert!._id}`, {
    data: { action: "set_expertise", expertiseDomains: ["medical"], credentialSummary: "test" },
  });
  expect(res.ok()).toBeTruthy();
  await api.dispose();

  await mongoose.connect(process.env.MONGO_URI!);
  const reloadedClaim = await Claim.findById(claim._id);
  expect(reloadedClaim!.currentAssessmentVersion).toBe(claimSnapshotBefore.currentAssessmentVersion);
  expect(reloadedClaim!.canonicalText).toBe(claimSnapshotBefore.canonicalText);

  const [reputationAfter, rewardAfter, trustEventAfter] = await Promise.all([
    ReputationLog.countDocuments({}),
    RewardLog.countDocuments({}),
    TrustEvent.countDocuments({}),
  ]);
  expect(reputationAfter).toBe(reputationBefore);
  expect(rewardAfter).toBe(rewardBefore);
  expect(trustEventAfter).toBe(trustEventBefore);

  await Claim.deleteOne({ _id: claim._id });
  await mongoose.disconnect();
});

// ---------------------------------------------------------------------------
// GET /api/experts - directory
// ---------------------------------------------------------------------------

test("only platform-recognized (role=expert) users appear in the directory", async ({ request }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "expert1" }, { $set: { expertiseDomains: ["medical"] } });
  await mongoose.disconnect();

  const res = await request.get("/api/experts");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  const usernames = body.experts.map((item: any) => item.username);
  expect(usernames).toContain("expert1");
  expect(usernames).not.toContain("usera");
  expect(usernames).not.toContain("admin1");
});

test("expertise domains and credential summary are exposed accurately, with no private/admin fields leaked", async ({
  request,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne(
    { username: "expert1" },
    { $set: { expertiseDomains: ["medical", "scientific"], expertCredentialSummary: "Practicing physician." } }
  );
  await mongoose.disconnect();

  const res = await request.get("/api/experts");
  const body = await res.json();
  const entry = body.experts.find((item: any) => item.username === "expert1");
  expect(entry).toBeTruthy();
  expect(entry.expertise).toEqual(
    expect.arrayContaining([
      { domain: "medical", label: "Medicine" },
      { domain: "scientific", label: "Science" },
    ])
  );
  expect(entry.credentialSummary).toBe("Practicing physician.");

  const raw = JSON.stringify(entry);
  expect(raw).not.toContain("moderationStatus");
  expect(raw).not.toContain("email");
  expect(raw).not.toContain("riskScore");
  expect(raw).not.toContain("suspiciousFlags");
  expect(raw).not.toContain("expertCategory");
  expect(entry.role).toBeUndefined();
});

test("an unknown domain filter is rejected with 400", async ({ request }) => {
  const res = await request.get("/api/experts?domain=astrology");
  expect(res.status()).toBe(400);
});

test("a valid domain filter returns only matching experts", async ({ request }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const password = await User.findOne({ username: "expert1" }).select("password");
  await User.updateOne({ username: "expert1" }, { $set: { expertiseDomains: ["medical"] } });
  await User.create({
    username: "expert2",
    email: "expert2@test.com",
    password: password!.password,
    role: "expert",
    moderationStatus: "active",
    onboardingCompleted: true,
    expertiseDomains: ["economic"],
  });
  await mongoose.disconnect();

  const medicalRes = await request.get("/api/experts?domain=medical");
  const medicalBody = await medicalRes.json();
  const medicalUsernames = medicalBody.experts.map((item: any) => item.username);
  expect(medicalUsernames).toContain("expert1");
  expect(medicalUsernames).not.toContain("expert2");

  const economicRes = await request.get("/api/experts?domain=economic");
  const economicBody = await economicRes.json();
  const economicUsernames = economicBody.experts.map((item: any) => item.username);
  expect(economicUsernames).toContain("expert2");
  expect(economicUsernames).not.toContain("expert1");
});

test("directory ordering is deterministic: grouped by domain, then alphabetical by username", async ({ request }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const password = await User.findOne({ username: "expert1" }).select("password");
  await User.updateOne({ username: "expert1" }, { $set: { expertiseDomains: ["medical"] } });
  await User.create([
    {
      username: "zzz_economic_expert",
      email: "zzzecon@test.com",
      password: password!.password,
      role: "expert",
      moderationStatus: "active",
      onboardingCompleted: true,
      expertiseDomains: ["economic"],
    },
    {
      username: "aaa_economic_expert",
      email: "aaaecon@test.com",
      password: password!.password,
      role: "expert",
      moderationStatus: "active",
      onboardingCompleted: true,
      expertiseDomains: ["economic"],
    },
  ]);
  await mongoose.disconnect();

  const firstCall = await (await request.get("/api/experts")).json();
  const secondCall = await (await request.get("/api/experts")).json();
  const firstOrder = firstCall.experts.map((item: any) => item.username);
  const secondOrder = secondCall.experts.map((item: any) => item.username);
  expect(firstOrder).toEqual(secondOrder); // deterministic across repeated calls

  // "economic" sorts before "medical" alphabetically, and within "economic"
  // aaa_economic_expert sorts before zzz_economic_expert.
  const aaaIndex = firstOrder.indexOf("aaa_economic_expert");
  const zzzIndex = firstOrder.indexOf("zzz_economic_expert");
  const expert1Index = firstOrder.indexOf("expert1");
  expect(aaaIndex).toBeGreaterThanOrEqual(0);
  expect(zzzIndex).toBeGreaterThan(aaaIndex);
  expect(expert1Index).toBeGreaterThan(zzzIndex);
});

test("block/mute excludes an expert from that viewer's directory results only", async ({ baseURL, request }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "expert1" }, { $set: { expertiseDomains: ["medical"] } });
  const usera = await User.findOne({ username: "usera" });
  const expert = await User.findOne({ username: "expert1" });
  await UserRelation.create({ sourceUser: usera!._id, targetUser: expert!._id, relationType: "block" });
  await mongoose.disconnect();

  const anonymousRes = await request.get("/api/experts");
  const anonymousBody = await anonymousRes.json();
  expect(anonymousBody.experts.map((item: any) => item.username)).toContain("expert1");

  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");
  const viewerRes = await api.get("/api/experts");
  const viewerBody = await viewerRes.json();
  expect(viewerBody.experts.map((item: any) => item.username)).not.toContain("expert1");
  await api.dispose();
});

test("follow state is accurate: follower sees true, non-follower sees false, anonymous sees false", async ({
  baseURL,
  request,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "expert1" }, { $set: { expertiseDomains: ["medical"] } });
  const usera = await User.findOne({ username: "usera" });
  const expert = await User.findOne({ username: "expert1" });
  await Follow.create({ follower: usera!._id, following: expert!._id });
  await mongoose.disconnect();

  const anonymousRes = await request.get("/api/experts");
  const anonymousBody = await anonymousRes.json();
  expect(anonymousBody.experts.find((item: any) => item.username === "expert1").follow.isFollowing).toBe(false);

  const { api: followerApi } = await apiLogin(baseURL, "usera@test.com", "Password123!");
  const followerBody = await (await followerApi.get("/api/experts")).json();
  expect(followerBody.experts.find((item: any) => item.username === "expert1").follow.isFollowing).toBe(true);
  await followerApi.dispose();

  // userb is fixture-suspended in prepareTestDb, but suspension doesn't
  // block reading a public directory as a logged-out-equivalent viewer here
  // - login itself would fail for a suspended account, so we assert the
  // non-follower case using admin1 instead, which is active and unrelated.
  const { api: nonFollowerApi } = await apiLogin(baseURL, "admin@test.com", "Password123!");
  const nonFollowerBody = await (await nonFollowerApi.get("/api/experts")).json();
  expect(nonFollowerBody.experts.find((item: any) => item.username === "expert1").follow.isFollowing).toBe(false);
  await nonFollowerApi.dispose();
});

// ---------------------------------------------------------------------------
// Profile presentation
// ---------------------------------------------------------------------------

test("ordinary user's profile is unchanged - no expert badge, no domain, no credential text", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/u/usera");
  await expect(page.getByRole("heading", { name: "usera" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Verified Expert")).not.toBeVisible();
});

// Regression for the discovered production inconsistency: a recognized
// expert (role === "expert") with no expertiseDomains assigned yet must
// still show the Verified Expert badge on their own profile - badge
// visibility must never be inferred from domain/credential enrichment.
test("an expert with zero assigned domains still shows the Verified Expert badge on their profile", async ({
  page,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne({ username: "expert1" }, { $set: { expertiseDomains: [], expertCredentialSummary: "" } });
  await mongoose.disconnect();

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/u/expert1");
  await expect(page.getByRole("heading", { name: "expert1" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Verified Expert")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Rendered smoke: /experts -> Expert card -> Profile
// ---------------------------------------------------------------------------

test("rendered smoke: /experts shows a Verified Expert card with domain and credential summary, linking through to the profile", async ({
  page,
}) => {
  await mongoose.connect(process.env.MONGO_URI!);
  await User.updateOne(
    { username: "expert1" },
    { $set: { expertiseDomains: ["medical"], expertCredentialSummary: "Practicing physician, 12 years." } }
  );
  await mongoose.disconnect();

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/experts");

  const expertsList = page.getByTestId("experts-list");
  await expect(expertsList.getByText("expert1")).toBeVisible({ timeout: 15_000 });
  await expect(expertsList.getByText("Verified Expert").first()).toBeVisible();
  await expect(expertsList.getByText("Medicine").first()).toBeVisible();
  await expect(expertsList.getByText("Practicing physician, 12 years.").first()).toBeVisible();
  await expect(expertsList.locator('[data-testid^="expert-follow-"]')).toBeVisible();

  await expertsList.getByText("expert1").first().click();
  await expect(page).toHaveURL(/\/u\/expert1/);
  await expect(page.getByRole("heading", { name: "expert1" })).toBeVisible();
  await expect(page.getByText("Verified Expert").first()).toBeVisible();
  await expect(page.getByText("Medicine").first()).toBeVisible();
  await expect(page.getByText("Practicing physician, 12 years.").first()).toBeVisible();
});
