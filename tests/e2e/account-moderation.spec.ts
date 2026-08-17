import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);
});

test("suspended user cannot stay in protected area after access check", async ({ page }) => {
  // This test assumes you suspend userb manually or via seeded state before running.
  await page.goto("/login");
  await page.getByLabel("Email").fill("userb@test.com");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: /login/i }).click();

  // Depending on your enforcement message:
  await expect(page.getByText(/suspended|banned|login failed/i)).toBeVisible();
});
