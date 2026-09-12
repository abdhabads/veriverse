import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import ClaimFollow from "@/models/ClaimFollow";
import { findOrCreateClaim } from "@/lib/claimIdentity";

dotenv.config({ path: ".env.test.local" });

const claimIds: mongoose.Types.ObjectId[] = [];

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    ClaimFollow.deleteMany({ claim: { $in: claimIds } }),
  ]);
  claimIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

async function apiLogin(baseURL: string | undefined, email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post("/api/login", { data: { email, password } });
  const json = await res.json();
  return { api, userId: json.user?._id as string | undefined };
}

async function seedClaim() {
  const { claim } = await findOrCreateClaim(`Follow-test claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  return String(claim._id);
}

test("authenticated POST creates exactly one ClaimFollow row and returns following:true", async ({ baseURL }) => {
  const claimId = await seedClaim();
  const { api, userId } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const res = await api.post(`/api/claims/${claimId}/follow`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ success: true, following: true });

  const rows = await ClaimFollow.find({ user: userId, claim: claimId });
  expect(rows.length).toBe(1);

  await api.dispose();
});

test("repeated POST is idempotent - remains following:true, still exactly one row", async ({ baseURL }) => {
  const claimId = await seedClaim();
  const { api, userId } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const first = await api.post(`/api/claims/${claimId}/follow`);
  const second = await api.post(`/api/claims/${claimId}/follow`);

  expect((await first.json()).following).toBe(true);
  expect((await second.json()).following).toBe(true);

  const rows = await ClaimFollow.find({ user: userId, claim: claimId });
  expect(rows.length).toBe(1);

  await api.dispose();
});

test("two concurrent POSTs cannot produce two rows", async ({ baseURL }) => {
  const claimId = await seedClaim();
  const { api, userId } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const [firstRes, secondRes] = await Promise.all([
    api.post(`/api/claims/${claimId}/follow`),
    api.post(`/api/claims/${claimId}/follow`),
  ]);

  expect(firstRes.status()).toBe(200);
  expect(secondRes.status()).toBe(200);
  expect((await firstRes.json()).following).toBe(true);
  expect((await secondRes.json()).following).toBe(true);

  const rows = await ClaimFollow.find({ user: userId, claim: claimId });
  expect(rows.length).toBe(1);

  await api.dispose();
});

test("authenticated DELETE removes the relation and returns following:false; repeating DELETE stays successful", async ({
  baseURL,
}) => {
  const claimId = await seedClaim();
  const { api, userId } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  await api.post(`/api/claims/${claimId}/follow`);
  expect((await ClaimFollow.find({ user: userId, claim: claimId })).length).toBe(1);

  const first = await api.delete(`/api/claims/${claimId}/follow`);
  expect(first.status()).toBe(200);
  expect((await first.json())).toEqual({ success: true, following: false });
  expect((await ClaimFollow.find({ user: userId, claim: claimId })).length).toBe(0);

  // Repeating DELETE on an already-absent relation must remain harmless.
  const second = await api.delete(`/api/claims/${claimId}/follow`);
  expect(second.status()).toBe(200);
  expect((await second.json())).toEqual({ success: true, following: false });

  await api.dispose();
});

test("unauthenticated POST and DELETE are rejected", async ({ baseURL }) => {
  const claimId = await seedClaim();
  const anon = await playwrightRequest.newContext({ baseURL });

  const postRes = await anon.post(`/api/claims/${claimId}/follow`);
  expect(postRes.status()).toBe(401);

  const deleteRes = await anon.delete(`/api/claims/${claimId}/follow`);
  expect(deleteRes.status()).toBe(401);

  await anon.dispose();
});

test("malformed and nonexistent claim IDs are rejected correctly for both mutations", async ({ baseURL }) => {
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");

  const malformedPost = await api.post("/api/claims/not-a-real-id/follow");
  expect(malformedPost.status()).toBe(400);
  const malformedDelete = await api.delete("/api/claims/not-a-real-id/follow");
  expect(malformedDelete.status()).toBe(400);

  const fakeId = new mongoose.Types.ObjectId().toString();
  const nonexistentPost = await api.post(`/api/claims/${fakeId}/follow`);
  expect(nonexistentPost.status()).toBe(404);
  const nonexistentDelete = await api.delete(`/api/claims/${fakeId}/follow`);
  expect(nonexistentDelete.status()).toBe(404);

  await api.dispose();
});

test("Claim GET reports accurate isFollowing and followerCount for anonymous and authenticated requesters", async ({
  baseURL,
}) => {
  const claimId = await seedClaim();
  const { api } = await apiLogin(baseURL, "usera@test.com", "Password123!");
  const anon = await playwrightRequest.newContext({ baseURL });

  const beforeAnon = await (await anon.get(`/api/claims/${claimId}`)).json();
  expect(beforeAnon.follow).toEqual({ isFollowing: false, followerCount: 0 });

  const beforeAuth = await (await api.get(`/api/claims/${claimId}`)).json();
  expect(beforeAuth.follow).toEqual({ isFollowing: false, followerCount: 0 });

  await api.post(`/api/claims/${claimId}/follow`);

  const afterAuth = await (await api.get(`/api/claims/${claimId}`)).json();
  expect(afterAuth.follow).toEqual({ isFollowing: true, followerCount: 1 });

  // followerCount is public - an anonymous viewer sees the same count, but
  // never a stale/substituted isFollowing for themselves.
  const afterAnon = await (await anon.get(`/api/claims/${claimId}`)).json();
  expect(afterAnon.follow).toEqual({ isFollowing: false, followerCount: 1 });

  await api.dispose();
  await anon.dispose();
});

test("rendered smoke: authenticated follow/unfollow cycle, and logged-out visitor sees the control without mutating", async ({
  page,
}) => {
  const claimId = await seedClaim();

  await login(page, "usera@test.com", "Password123!");
  await page.goto(`/claims/${claimId}`);

  const followButton = page.getByTestId(`claim-follow-${claimId}`);
  await expect(followButton).toHaveText(/follow claim/i, { timeout: 15_000 });

  await followButton.click();
  await expect(followButton).toHaveText(/following/i);
  await expect(page.getByText("1 follower")).toBeVisible();

  await followButton.click();
  await expect(followButton).toHaveText(/follow claim/i);
  await expect(page.getByText("1 follower")).toHaveCount(0);

  // Log out directly (cookies + the localStorage user record ClaimPageClient
  // reads for isLoggedIn) rather than hunting for a logout control that
  // doesn't exist on this page.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());

  await page.goto(`/claims/${claimId}`);
  const loggedOutButton = page.getByTestId(`claim-follow-${claimId}`);
  await expect(loggedOutButton).toHaveText(/follow claim/i, { timeout: 15_000 });

  await loggedOutButton.click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });

  const rows = await ClaimFollow.find({ claim: claimId });
  expect(rows.length).toBe(0);
});
