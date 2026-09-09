import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("fast success: never shows the checking phase, reaches success, returns to idle", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("Fast publish: the office reopens Monday.");

  const publishButton = page.getByTestId("publish-button");

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/posts") && res.request().method() === "POST" && res.ok()
    ),
    publishButton.click(),
  ]);

  // "Checking..." should not have had a chance to appear for a fast local
  // response (well under the 1500ms threshold in this test environment).
  await expect(page.getByText("Checking claim against available evidence…")).toHaveCount(0);

  const newPost = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "Fast publish: the office reopens Monday." })
    .first();
  await expect(newPost).toBeVisible();

  // Composer returns to idle: hashtag hint back, button enabled, textarea cleared.
  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible();
  await expect(publishButton).toBeEnabled();
  await expect(composer).toHaveValue("");
});

test("slow success: transitions to checking, then to success, then idle", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 3500));
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("Slow publish: a new bus route starts next quarter.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  // Immediately: Publishing…
  await expect(page.getByText("Publishing…")).toBeVisible();

  // After the ~1500ms client timer, before the delayed response resolves at
  // ~3500ms - generous window to absorb dev-server timing jitter.
  await expect(page.getByText("Checking claim against available evidence…")).toBeVisible({
    timeout: 3000,
  });

  // Once the delayed response finally resolves: Published ✓, then idle.
  await expect(page.getByText("Published ✓")).toBeVisible({ timeout: 3000 });
  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible({
    timeout: 3000,
  });
  await expect(publishButton).toBeEnabled();
});

test("early failure: fails before the checking timer, never shows success, becomes usable again", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Simulated early failure" }),
      });
      return;
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("This attempt will fail early.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  await expect(page.getByText(/simulated early failure/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Published ✓")).toHaveCount(0);
  await expect(page.getByText("Checking claim against available evidence…")).toHaveCount(0);
  await expect(publishButton).toBeEnabled();

  // Content is preserved on failure (existing behavior - not cleared before success).
  await expect(composer).toHaveValue("This attempt will fail early.");
});

test("late failure: checking is already visible, then fails, progress clears, never shows success", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "Simulated late failure" }),
      });
      return;
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("This attempt will fail after checking appears.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  // Checking should appear ~1500ms after click, well before the 3500ms
  // delayed response - generous window to absorb dev-server timing jitter
  // without racing the response.
  await expect(page.getByText("Checking claim against available evidence…")).toBeVisible({
    timeout: 3000,
  });

  await expect(page.getByText(/simulated late failure/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Checking claim against available evidence…")).toHaveCount(0);
  await expect(page.getByText("Published ✓")).toHaveCount(0);
  await expect(publishButton).toBeEnabled();
});

test("duplicate-submit protection: button is disabled while a publish is pending", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  let postRequestCount = 0;
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "POST") {
      postRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });

  const composer = page.getByPlaceholder(/share something truthful/i);
  await composer.fill("Only one of these should ever be sent.");

  const publishButton = page.getByTestId("publish-button");
  await publishButton.click();

  // Immediately disabled - a user cannot trigger a second submission from
  // the same composer while the first is pending.
  await expect(publishButton).toBeDisabled();

  await expect(page.getByText("Use hashtags like #truth #health #politics")).toBeVisible({
    timeout: 5000,
  });
  expect(postRequestCount).toBe(1);
});
