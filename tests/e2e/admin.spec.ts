import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("admin can access dashboard", async ({ page }) => {
  await login(page, "admin@test.com", "Password123!");
  await page.goto("/admin");

  await expect(page.getByRole("heading", { name: /admin dashboard/i })).toBeVisible();
});

test("admin can access users page", async ({ page }) => {
  await login(page, "admin@test.com", "Password123!");
  await page.goto("/admin/users");

  await expect(page.getByText(/admin user management/i)).toBeVisible();
  await expect(page.getByText(/usera@test.com/i)).toBeVisible();
});

test("admin can warn a user", async ({ page }) => {
  await login(page, "admin@test.com", "Password123!");
  await page.goto("/admin/users");

  const noteArea = page.getByPlaceholder(/add moderation note/i).first();
  await noteArea.fill("First warning for testing.");
  await page.getByRole("button", { name: /^warn$/i }).first().click();

  await expect(page.getByText(/action applied|warning|updated/i)).toBeVisible();
});

test("admin can view audit logs", async ({ page }) => {
  await login(page, "admin@test.com", "Password123!");
  await page.goto("/admin/audit");

  await expect(page.getByText(/admin audit logs/i)).toBeVisible();
});

test("admin can access analytics pages", async ({ page }) => {
  await login(page, "admin@test.com", "Password123!");
  await page.goto("/admin/analytics");
  await expect(page.getByText(/platform analytics/i)).toBeVisible();

  await page.goto("/admin/trust-analytics");
  await expect(page.getByRole("heading", { name: /trust analytics/i })).toBeVisible();
});

test("normal user cannot access admin page", async ({ page }) => {
  await login(page, "usera@test.com", "Password123!");
  await page.goto("/admin");
  await expect(page).toHaveURL(/feed/);
});
