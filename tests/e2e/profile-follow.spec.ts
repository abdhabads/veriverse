import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("regular user can follow/unfollow from another user's profile, and it persists across reload", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/u/userb");

  const followButton = page.getByTestId("follow-toggle");
  await expect(followButton).toBeVisible({ timeout: 10_000 });
  await expect(followButton).toHaveText("Follow");

  await followButton.click();
  await expect(followButton).toHaveText("Following");

  // Reload: state must come from the server, not client memory.
  await page.reload();
  const followButtonAfterReload = page.getByTestId("follow-toggle");
  await expect(followButtonAfterReload).toBeVisible({ timeout: 10_000 });
  await expect(followButtonAfterReload).toHaveText("Following");

  await followButtonAfterReload.click();
  await expect(followButtonAfterReload).toHaveText("Follow");
});

test("own profile does not expose a self-follow control", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/u/usera");

  // Give the page a moment to resolve currentUser + profile before
  // asserting absence, so this isn't a false pass from checking too early.
  await expect(page.getByRole("heading", { name: "usera" })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId("follow-toggle")).toHaveCount(0);
});
