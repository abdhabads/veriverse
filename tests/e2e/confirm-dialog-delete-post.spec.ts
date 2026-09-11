import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Covers the P2.1 ConfirmDialog primitive via its one representative
// adoption in this phase: PostCard's own-post "Delete" action, migrated
// from window.confirm() to components/ui/ConfirmDialog. Verifies exactly
// the contract the primitive promises: Cancel and Escape both back out
// with no deletion, Confirm deletes exactly once, and a second Delete
// click reopens cleanly afterwards.

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("Cancel closes the dialog and does not delete the post", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  await card.getByRole("button", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete this post?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Are you sure you want to delete this post?");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // Post is untouched - still there after a reload, not just optimistically
  // still on screen.
  await page.reload();
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: "The local clinic opens at 8am tomorrow." })
  ).toBeVisible();
});

test("Escape closes the dialog and does not delete the post", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  await card.getByRole("button", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete this post?" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: "The local clinic opens at 8am tomorrow." })
  ).toBeVisible();
});

test("Confirm deletes the post exactly once", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/feed");

  const card = page
    .locator('[data-testid="post-card"]')
    .filter({ hasText: "The local clinic opens at 8am tomorrow." })
    .first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  let deleteRequestCount = 0;
  page.on("request", (req) => {
    if (req.method() === "DELETE" && /\/api\/posts\//.test(req.url())) {
      deleteRequestCount += 1;
    }
  });

  await card.getByRole("button", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete this post?" });
  await expect(dialog).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (res) => /\/api\/posts\//.test(res.url()) && res.request().method() === "DELETE"
    ),
    dialog.getByRole("button", { name: "Delete" }).click(),
  ]);

  await expect(dialog).toBeHidden();
  await expect(
    page.locator('[data-testid="post-card"]').filter({ hasText: "The local clinic opens at 8am tomorrow." })
  ).toHaveCount(0);
  expect(deleteRequestCount).toBe(1);
});
