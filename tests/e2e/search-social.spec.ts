import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import User from "@/models/User";
import Post from "@/models/Post";

dotenv.config({ path: ".env.test.local" });

const TARGET_USERNAME = "socialtarget";
const TARGET_POST_CONTENT = "socialtarget's seeded post for the Search->Follow journey.";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);

  // A dedicated, ordinary (not suspended/banned/deactivated) fixture user
  // with one post - prepareTestDb.ts's own "userb" is deliberately seeded
  // as currently-suspended for an unrelated moderation test, so it is
  // correctly excluded from search by P1.2-A and unsuitable as a Follow
  // target here.
  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const target = await User.create({
    username: TARGET_USERNAME,
    email: "socialtarget@test.com",
    password: "x",
    role: "user",
  });
  await Post.create({
    author: target._id,
    content: TARGET_POST_CONTENT,
    status: "unverified",
    aiLabel: "safe",
  });
  await mongoose.disconnect();
});

test("Search People results are socially actionable: Follow/Unfollow, persists, reflected in Following feed", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");

  let followGetCount = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/follow") && req.method() === "GET") {
      followGetCount += 1;
    }
  });

  await page.goto(`/search?q=${TARGET_USERNAME}&type=users`);

  const followButton = page.getByTestId(`search-follow-${TARGET_USERNAME}`);
  await expect(followButton).toBeVisible({ timeout: 10_000 });
  await expect(followButton).toHaveText("Follow");

  // Exactly one batched request for the whole results page, not one per row.
  expect(followGetCount).toBe(1);

  // Follow.
  await followButton.click();
  await expect(followButton).toHaveText("Following");

  // Reflected immediately in the Following feed (no feed code was touched).
  await page.goto("/feed?mode=following");
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: TARGET_POST_CONTENT })
  ).toBeVisible({ timeout: 15_000 });

  // Reload the search results: state persists as Following.
  await page.goto(`/search?q=${TARGET_USERNAME}&type=users`);
  const followButtonAfterReload = page.getByTestId(`search-follow-${TARGET_USERNAME}`);
  await expect(followButtonAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(followButtonAfterReload).toHaveText("Following");

  // Unfollow, reversing the relation.
  await followButtonAfterReload.click();
  await expect(followButtonAfterReload).toHaveText("Follow");
});

test("self does not show a Follow control in Search People results", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/search?q=usera&type=users");

  await expect(page.getByRole("button", { name: "usera", exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("search-follow-usera")).toHaveCount(0);
});
