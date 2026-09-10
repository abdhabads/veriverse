import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import User from "@/models/User";

dotenv.config({ path: ".env.test.local" });

const TARGET_USERNAME = "msgtarget";
const TARGET_EMAIL = "msgtarget@test.com";

test.beforeEach(async ({ request }) => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });
  await request.get("/api/logout").catch(() => null);

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create({
    username: TARGET_USERNAME,
    email: TARGET_EMAIL,
    password,
    role: "user",
    moderationStatus: "active",
    onboardingCompleted: true,
  });
  await mongoose.disconnect();
});

test("User A messages User B from their profile, and User B can open and reply", async ({ page, browser }) => {
  await login(page, "usera@test.com", "Password123!");

  await page.goto(`/u/${TARGET_USERNAME}`);
  const messageButton = page.getByTestId("message-button");
  await expect(messageButton).toBeVisible({ timeout: 10_000 });

  await Promise.all([
    page.waitForURL(/\/messages\/.+/, { timeout: 10_000 }),
    messageButton.click(),
  ]);

  const conversationUrl = page.url();

  const composer = page.getByTestId("message-input");
  await expect(composer).toBeVisible({ timeout: 10_000 });
  await composer.fill("Hello from A");
  await page.getByTestId("message-send").click();

  await expect(
    page.locator('[data-testid="message-bubble"]').filter({ hasText: "Hello from A" })
  ).toBeVisible({ timeout: 10_000 });

  // User B, a fully separate authenticated session, opens the same
  // conversation and sees A's message.
  const pageB = await (await browser.newContext()).newPage();
  await login(pageB, TARGET_EMAIL, "Password123!");
  await pageB.goto(conversationUrl);

  await expect(
    pageB.locator('[data-testid="message-bubble"]').filter({ hasText: "Hello from A" })
  ).toBeVisible({ timeout: 10_000 });

  const composerB = pageB.getByTestId("message-input");
  await composerB.fill("Hello back from B");
  await pageB.getByTestId("message-send").click();

  await expect(
    pageB.locator('[data-testid="message-bubble"]').filter({ hasText: "Hello back from B" })
  ).toBeVisible({ timeout: 10_000 });

  // Back on A's side, a reload picks up B's reply (no realtime in P1.3-A).
  await page.reload();
  await expect(
    page.locator('[data-testid="message-bubble"]').filter({ hasText: "Hello back from B" })
  ).toBeVisible({ timeout: 10_000 });

  // The inbox list reflects the latest message as its preview.
  await page.goto("/messages");
  const row = page.getByTestId(`conversation-${TARGET_USERNAME}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText("Hello back from B");
});

test("an empty inbox shows the empty state", async ({ page }) => {
  await login(page, "expert@test.com", "Password123!");
  await page.goto("/messages");

  await expect(page.getByText("No conversations yet")).toBeVisible({ timeout: 10_000 });
});
