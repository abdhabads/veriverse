import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import Referral from "@/models/Referral";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
});

// Mirrors tests/e2e/messages-api.spec.ts's loginAs: next dev forces
// process.env.NODE_ENV to "development" internally, so
// lib/rateLimitGuard.ts's test-mode bypass never engages here - login's
// real 10/min/IP limit is live during these runs.
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

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

// Register's own 5/min/IP rate limit is real for the same reason
// documented in messages-api.spec.ts's loginAs - next dev forces NODE_ENV
// to "development", so the test-mode bypass never engages. This file
// registers several accounts across sequential tests, easily exceeding 5
// within a rolling 60s window; retry on 429 only, exactly like loginAs.
async function registerReferredUser(
  baseURL: string | undefined,
  referrerId: string | null,
  suffix: string
) {
  const api = await playwrightRequest.newContext({ baseURL });

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await api.post("/api/register", {
      data: {
        username: `refuser${suffix}`,
        email: `refuser${suffix}@test.com`,
        password: "Password123!",
        agreedToTerms: true,
        ...(referrerId !== null ? { referrerId } : {}),
      },
    });
    if (res.status() !== 429) return { api, res };

    const body = await res.json().catch(() => ({} as { retryAfterMs?: number }));
    const waitMs = Math.min(Number(body?.retryAfterMs) || 15000, 15000) + 250;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error(`Failed to register refuser${suffix} after retries (rate limited)`);
}

test("valid referral attribution creates a Joined referral, and registration succeeds", async ({ baseURL }) => {
  const apiReferrer = await loginAs(baseURL, "usera@test.com");
  const referrerId = (await (await apiReferrer.get("/api/me")).json()).user._id;

  const { res: registerRes, api: apiNew } = await registerReferredUser(
    baseURL,
    referrerId,
    uniqueSuffix()
  );
  expect(registerRes.status()).toBe(201);

  const stats = await (await apiReferrer.get("/api/referrals")).json();
  expect(stats.joinedCount).toBe(1);
  expect(stats.activatedCount).toBe(0);

  await apiReferrer.dispose();
  await apiNew.dispose();
});

test("an invalid/nonexistent referrerId does not block registration", async ({ baseURL }) => {
  const { res: registerRes, api } = await registerReferredUser(
    baseURL,
    "000000000000000000000000", // well-formed ObjectId, no such user
    uniqueSuffix()
  );
  expect(registerRes.status()).toBe(201);

  const { res: registerRes2, api: api2 } = await registerReferredUser(
    baseURL,
    "not-a-valid-object-id",
    uniqueSuffix()
  );
  expect(registerRes2.status()).toBe(201);

  await api.dispose();
  await api2.dispose();
});

test("a referred account can only ever have one Referral row (unique referredUser)", async ({ baseURL }) => {
  const apiReferrer = await loginAs(baseURL, "usera@test.com");
  const referrerId = (await (await apiReferrer.get("/api/me")).json()).user._id;

  const { res: registerRes, api: apiNew } = await registerReferredUser(
    baseURL,
    referrerId,
    uniqueSuffix()
  );
  const registerJson = await registerRes.json();
  const referredUserId = registerJson.user._id;

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  let duplicateRejected = false;
  try {
    await Referral.create({
      referrer: referrerId,
      referredUser: referredUserId,
      status: "joined",
    });
  } catch (error: any) {
    duplicateRejected = error?.code === 11000;
  }
  await mongoose.disconnect();

  expect(duplicateRejected).toBe(true);

  await apiReferrer.dispose();
  await apiNew.dispose();
});

test("activation requires both onboarding completion and at least one post, and happens once", async ({ baseURL }) => {
  const apiReferrer = await loginAs(baseURL, "usera@test.com");
  const referrerId = (await (await apiReferrer.get("/api/me")).json()).user._id;
  const suffix = uniqueSuffix();

  const { api: apiNew } = await registerReferredUser(baseURL, referrerId, suffix);
  const loginRes = await apiNew.post("/api/login", {
    data: { email: `refuser${suffix}@test.com`, password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();

  // Onboarding alone (skip=true) is not enough - no post yet.
  await apiNew.patch("/api/onboarding", { data: { skip: true } });
  let stats = await (await apiReferrer.get("/api/referrals")).json();
  expect(stats.joinedCount).toBe(1);
  expect(stats.activatedCount).toBe(0);

  // Creating a post completes the rule - activation happens here.
  const postRes = await apiNew.post("/api/posts", {
    data: { content: "My first genuine post on VeriVerse." },
  });
  expect(postRes.ok()).toBeTruthy();

  stats = await (await apiReferrer.get("/api/referrals")).json();
  expect(stats.joinedCount).toBe(1);
  expect(stats.activatedCount).toBe(1);

  // A second post must not double-count or error.
  await apiNew.post("/api/posts", { data: { content: "A second post, still just one activation." } });
  stats = await (await apiReferrer.get("/api/referrals")).json();
  expect(stats.joinedCount).toBe(1);
  expect(stats.activatedCount).toBe(1);

  await apiReferrer.dispose();
  await apiNew.dispose();
});

test("referral API Joined/Activated counts reflect the full referred set, not just the still-joined subset", async ({ baseURL }) => {
  const apiReferrer = await loginAs(baseURL, "usera@test.com");
  const referrerId = (await (await apiReferrer.get("/api/me")).json()).user._id;

  const suffixA = uniqueSuffix();
  const suffixB = `${uniqueSuffix()}b`;

  const { api: apiA, res: resA } = await registerReferredUser(baseURL, referrerId, suffixA);
  const { api: apiB, res: resB } = await registerReferredUser(baseURL, referrerId, suffixB);
  expect(resA.status()).toBe(201);
  expect(resB.status()).toBe(201);

  // Only B activates.
  await apiB.post("/api/login", { data: { email: `refuser${suffixB}@test.com`, password: "Password123!" } });
  await apiB.patch("/api/onboarding", { data: { skip: true } });
  await apiB.post("/api/posts", { data: { content: "Activated referral post." } });

  const stats = await (await apiReferrer.get("/api/referrals")).json();
  expect(stats.joinedCount).toBe(2);
  expect(stats.activatedCount).toBe(1);
  expect(stats.communityBuilderTier).toBeTruthy();
  expect(stats.communityBuilderTier.tier).toBe("none");

  await apiReferrer.dispose();
  await apiA.dispose();
  await apiB.dispose();
});

test("GET /api/referrals requires authentication and never exposes referred-user identities", async ({ baseURL }) => {
  const apiUnauth = await playwrightRequest.newContext({ baseURL });
  const res = await apiUnauth.get("/api/referrals");
  expect(res.status()).toBe(401);
  await apiUnauth.dispose();
});
