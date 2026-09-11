import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("ordinary user can discover Search from navigation, search, and reach a profile and a post", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");

  // Search is discoverable in the desktop navigation. Scoped to the navbar
  // specifically, since the search page itself also has a "Search" button
  // (its submit button) with the same accessible name.
  const desktopSearchLink = page.locator(".vv-navbar").getByRole("button", { name: "Search" });
  await expect(desktopSearchLink).toBeVisible();
  await desktopSearchLink.click();

  await expect(page).toHaveURL(/\/search/);

  // Perform a search that matches both a seeded user and a seeded post.
  await page.getByPlaceholder(/search users, posts, or topics/i).fill("usera");
  await page.locator(".vv-container").getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/\/search\?q=usera/);

  // People result links to the profile.
  const userResultLink = page.getByRole("button", { name: "usera", exact: true }).first();
  await expect(userResultLink).toBeVisible({ timeout: 10_000 });
  await userResultLink.click();
  await expect(page).toHaveURL(/\/u\/usera/);
  await expect(page.getByRole("heading", { name: "usera" })).toBeVisible();

  // Back to search for the post-result half of the journey.
  await page.goto("/search?q=clinic&type=posts");
  const postResult = page.getByText("The local clinic opens at 8am tomorrow.");
  await expect(postResult).toBeVisible({ timeout: 10_000 });

  // Existing trust verdict presentation still renders on the result -
  // P2.7 consolidated Search's post rendering onto the same PostCard
  // (profile-compact) presentation used elsewhere, so this is now the
  // canonical TrustSummaryLine pill, not a bespoke Search-only badge.
  await expect(page.locator(".vv-verdict-pill").first()).toBeVisible();

  // Clicking through to the full post still works - PostCard's own
  // "View full analysis" link (the same wording used on profile pages),
  // not a Search-specific "View Post" button.
  await page.getByRole("link", { name: /view full analysis/i }).first().click();
  await expect(page).toHaveURL(/\/posts\//);
});

test("Search is visible in the mobile navigation menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "usera@test.com", "Password123!");

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
});
