import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.get("/api/logout").catch(() => null);
});

test("redirects unauthenticated user from feed to login", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/login/);
});

test("user can log in and reach feed", async ({ page }) => {
  await page.goto("/login");
  await page.waitForSelector('input[type="email"]', { state: "visible" });
  await page.getByLabel("Email").fill("usera@test.com");
  await page.getByLabel("Password").fill("Password123!");

  await Promise.all([
    page.waitForURL(/feed/, { timeout: 15_000 }),
    page.getByRole("button", { name: /login/i }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "VeriVerse", exact: true })).toBeVisible();
});

test("logged-in user is redirected away from login", async ({ page }) => {
  await page.goto("/login");
  await page.waitForSelector('input[type="email"]', { state: "visible" });
  await page.getByLabel("Email").fill("usera@test.com");
  await page.getByLabel("Password").fill("Password123!");

  await Promise.all([
    page.waitForURL(/feed/, { timeout: 15_000 }),
    page.getByRole("button", { name: /login/i }).click(),
  ]);

  await page.goto("/login");
  await expect(page).toHaveURL(/feed/, { timeout: 10_000 });
});
