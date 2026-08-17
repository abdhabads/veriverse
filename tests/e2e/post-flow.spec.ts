import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login, createPost } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("user can create a safe post", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await createPost(page, "The university portal opens for registration tomorrow.");

  const newPost = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The university portal opens for registration tomorrow." })
    .first();

  await expect(newPost).toBeVisible();
});

test("high-risk post gets flagged or routed", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await createPost(page, "This miracle cure is 100% guaranteed to cure everything!!!");

  const newPost = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "This miracle cure is 100% guaranteed to cure everything!!!" })
    .filter({ hasText: "under expert review" })
    .first();

  await expect(newPost).toBeVisible({ timeout: 10_000 });
  await expect(newPost).toContainText("under expert review");
  await expect(newPost).toContainText("AI: needs review");
});

test("user can comment on a post", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const commentBox = page.getByPlaceholder(/add a comment/i).first();
  await commentBox.fill("Useful update.");
  await page.getByRole("button", { name: /send/i }).first().click();

  await expect(page.getByText("Useful update.")).toBeVisible();
});

test("user can vote on another user's post", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  // Scope to a seeded post owned by another user so the vote button is enabled.
  const firstPost = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "This miracle cure is 100% guaranteed!!!" })
    .filter({ hasText: "userb" })
    .first();
  await firstPost.waitFor({ state: "visible", timeout: 10_000 });

  const opposeButton = firstPost.getByRole("button", { name: /oppose/i });
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/vote") && res.request().method() === "POST" && res.ok(),
      { timeout: 10_000 }
    ),
    opposeButton.click(),
  ]);

  await expect(page.getByText(/vote recorded/i)).toBeVisible();
});
