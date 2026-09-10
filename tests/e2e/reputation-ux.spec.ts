import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import User from "@/models/User";
import { login } from "./helpers";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  await User.create([
    {
      username: "lb_active",
      email: "lb_active@test.com",
      password: "x",
      role: "user",
      moderationStatus: "active",
      reputation: 40,
      rewardPoints: 10,
    },
    {
      username: "lb_banned",
      email: "lb_banned@test.com",
      password: "x",
      role: "user",
      moderationStatus: "banned",
      reputation: 200,
      rewardPoints: 999,
    },
    {
      username: "lb_deactivated",
      email: "lb_deactivated@test.com",
      password: "x",
      role: "user",
      isDeactivated: true,
      reputation: 150,
      rewardPoints: 500,
    },
    {
      username: "lb_suspended_now",
      email: "lb_suspended_now@test.com",
      password: "x",
      role: "user",
      moderationStatus: "suspended",
      suspendedUntil: new Date(Date.now() + 60 * 60 * 1000),
      reputation: 120,
      rewardPoints: 300,
    },
    {
      username: "lb_suspended_expired",
      email: "lb_suspended_expired@test.com",
      password: "x",
      role: "user",
      moderationStatus: "suspended",
      suspendedUntil: new Date(Date.now() - 60 * 60 * 1000),
      reputation: 60,
      rewardPoints: 5,
    },
    {
      username: "lb_tie_a",
      email: "lb_tie_a@test.com",
      password: "x",
      role: "user",
      moderationStatus: "active",
      reputation: 40,
      rewardPoints: 30,
    },
    {
      username: "lb_tie_b",
      email: "lb_tie_b@test.com",
      password: "x",
      role: "user",
      moderationStatus: "active",
      reputation: 40,
      rewardPoints: 20,
    },
  ]);
  await mongoose.disconnect();
});

test("leaderboard excludes banned, deactivated, and currently-suspended users, but includes an expired suspension", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/leaderboard");
  expect(res.ok()).toBeTruthy();

  const json = await res.json();
  const usernames = json.users.map((u: any) => u.username);

  expect(usernames).not.toContain("lb_banned");
  expect(usernames).not.toContain("lb_deactivated");
  expect(usernames).not.toContain("lb_suspended_now");
  expect(usernames).not.toContain("userb"); // prepareTestDb's own suspended fixture

  expect(usernames).toContain("lb_suspended_expired");
  expect(usernames).toContain("lb_active");
  expect(usernames).toContain("admin1");

  await api.dispose();
});

test("leaderboard ranking stays reputation-descending with a rewardPoints tie-break, unmodified by the availability filter", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/api/leaderboard");
  const json = await res.json();
  const users = json.users as Array<{ username: string; reputation: number; rewardPoints: number }>;

  // Overall list stays non-increasing by reputation.
  for (let i = 1; i < users.length; i++) {
    expect(users[i].reputation).toBeLessThanOrEqual(users[i - 1].reputation);
  }

  // Same-reputation tie-break: higher rewardPoints ranks first.
  const tieAIndex = users.findIndex((u) => u.username === "lb_tie_a");
  const tieBIndex = users.findIndex((u) => u.username === "lb_tie_b");
  expect(tieAIndex).toBeGreaterThanOrEqual(0);
  expect(tieBIndex).toBeGreaterThanOrEqual(0);
  expect(tieAIndex).toBeLessThan(tieBIndex);

  await api.dispose();
});

test("ReputationInfo disclosure renders the reputation/claim-truth distinction, with no 'trust score' wording on touched pages", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/profile");

  const disclosure = page.getByText("What is reputation?").first();
  await expect(disclosure).toBeVisible({ timeout: 10_000 });
  await disclosure.click();

  await expect(
    page.getByText(
      "Reputation reflects past participation on VeriVerse. It does not determine whether a specific claim is true.",
      { exact: false }
    )
  ).toBeVisible();

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(bodyText).not.toContain("trust score");

  await page.goto("/reputation");
  const reputationBodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(reputationBodyText).not.toContain("trust score");

  await page.goto("/leaderboard");
  const leaderboardBodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  expect(leaderboardBodyText).not.toContain("trust score");
});
