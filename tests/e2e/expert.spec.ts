import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("expert can access expert queue", async ({ page }) => {
  await login(page, "expert@test.com", "Password123!");
  await page.goto("/expert");

  await expect(page.getByText(/expert review queue/i)).toBeVisible();
});

test("expert can review flagged content", async ({ page }) => {
  await login(page, "expert@test.com", "Password123!");
  await page.goto("/expert");

  const markFalse = page.getByRole("button", { name: /mark false/i }).first();
  await expect(markFalse).toBeVisible();
  await markFalse.click();

  await expect(page.getByText(/expert decision|submitted/i)).toBeVisible();
});
