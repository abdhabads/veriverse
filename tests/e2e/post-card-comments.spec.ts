import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("desktop: comment affordance is collapsed by default, shows a real zero, and expands/collapses", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  const toggle = card.getByRole("button", { name: /comments?|no comments yet/i });
  await expect(toggle).toBeVisible();
  // This post starts with zero comments and is among the first 10 posts that
  // are still auto-fetched on initial load, so a real, confirmed zero should
  // render - not a placeholder.
  await expect(toggle).toContainText("No comments yet");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Collapsed: no comment input/list rendered in the DOM at all.
  await expect(card.getByPlaceholder("Add a comment")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const input = card.getByPlaceholder("Add a comment");
  await expect(input).toBeVisible();

  await input.fill("Nice to know, thanks!");
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/comments") && res.request().method() === "POST" && res.ok()
    ),
    card.getByRole("button", { name: /send/i }).click(),
  ]);

  await expect(card.getByText("Nice to know, thanks!")).toBeVisible();
  await expect(toggle).toContainText("1 comment");

  // Same control collapses it again - input/list unmount.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByPlaceholder("Add a comment")).toHaveCount(0);
});

test("desktop: no regression to the evidence disclosure alongside the new comment affordance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  const evidenceToggle = card.getByRole("button", { name: /why this assessment/i });
  await expect(evidenceToggle).toHaveAttribute("aria-expanded", "false");
  await evidenceToggle.click();
  await expect(evidenceToggle).toHaveAttribute("aria-expanded", "true");
});

test("mobile: comment affordance routes to the post detail page instead of expanding inline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  // The desktop toggle (a <button>) exists in the DOM but is CSS-hidden below
  // the sm breakpoint - only the mobile link is actually visible/clickable.
  const desktopToggle = card.getByRole("button", { name: /comments?|no comments yet/i });
  await expect(desktopToggle).toBeHidden();

  const mobileLink = card.getByRole("link", { name: /comments?|no comments yet/i });
  await expect(mobileLink).toBeVisible();

  await mobileLink.click();
  await expect(page).toHaveURL(/\/posts\//);
});
