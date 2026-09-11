import { execSync } from "child_process";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { test, expect } from "@playwright/test";
import User from "@/models/User";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import { login } from "./helpers";

dotenv.config({ path: ".env.test.local" });

test.beforeEach(async () => {
  execSync("npx tsx tests/scripts/prepareTestDb.ts", { stdio: "inherit" });

  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const password = await bcrypt.hash("Password123!", 10);
  await User.create([
    {
      username: "huxa",
      email: "huxa@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 10,
      rewardPoints: 5,
    },
    {
      username: "huxb",
      email: "huxb@test.com",
      password,
      role: "user",
      moderationStatus: "active",
      onboardingCompleted: true,
      reputation: 8,
      rewardPoints: 3,
    },
  ]);
  await mongoose.disconnect();
});

// P2.5: Block/Mute moved from top-level buttons into a "More" safety
// overflow (ProfileSafetyMenu) so Block's danger styling no longer
// dominates the profile header next to Follow/Message. These helpers open
// that menu the same way a real user would before locating the action -
// the frozen P1.9 semantics being asserted below are otherwise unchanged.
// Idempotent "ensure open" rather than a blind toggle-click: the trigger
// toggles open/closed, and unblocking (unlike blocking) has no confirm
// dialog in between to close the menu as a side effect - so a second
// blind click after an unblock would close an already-open menu instead
// of opening it.
async function openSafetyMenu(page: import("@playwright/test").Page) {
  const menu = page.getByRole("menu");
  if (await menu.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: /safety options/i }).click();
  await expect(menu).toBeVisible();
}

test("public profile exposes Block and Mute to another viewer, never on your own profile", async ({ page }) => {
  await login(page, "huxa@test.com", "Password123!");

  await page.goto("/u/huxb");
  await openSafetyMenu(page);
  await expect(page.getByTestId("block-toggle")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("mute-toggle")).toBeVisible();

  await page.goto("/u/huxa");
  await expect(page.getByRole("button", { name: /safety options/i })).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("block-toggle")).not.toBeVisible();
  await expect(page.getByTestId("mute-toggle")).not.toBeVisible();
});

test("blocking from the profile page clears visible Follow/Message and creates the relation", async ({ page }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const huxa = await User.findOne({ username: "huxa" });
  const huxb = await User.findOne({ username: "huxb" });
  await Follow.create({ follower: huxa!._id, following: huxb!._id });
  await mongoose.disconnect();

  await login(page, "huxa@test.com", "Password123!");
  await page.goto("/u/huxb");

  await expect(page.getByTestId("follow-toggle")).toHaveText(/Following/, { timeout: 10_000 });
  await expect(page.getByTestId("message-button")).toBeVisible();

  await openSafetyMenu(page);
  await page.getByTestId("block-toggle").click();

  const dialog = page.getByRole("dialog", { name: "Block this user?" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Block" }).click();

  await openSafetyMenu(page);
  await expect(page.getByTestId("block-toggle")).toHaveText(/Unblock/, { timeout: 10_000 });
  await expect(page.getByTestId("follow-toggle")).not.toBeVisible();
  await expect(page.getByTestId("message-button")).not.toBeVisible();

  await mongoose.connect(process.env.MONGO_URI!);
  const relation = await UserRelation.findOne({
    sourceUser: huxa!._id,
    targetUser: huxb!._id,
    relationType: "block",
  });
  expect(relation).not.toBeNull();
  await mongoose.disconnect();
});

test("unblocking restores the Follow control but does not recreate the Follow relationship", async ({ page }) => {
  await mongoose.connect(process.env.MONGO_URI!);
  const huxa = await User.findOne({ username: "huxa" });
  const huxb = await User.findOne({ username: "huxb" });
  await Follow.create({ follower: huxa!._id, following: huxb!._id });
  await mongoose.disconnect();

  await login(page, "huxa@test.com", "Password123!");
  await page.goto("/u/huxb");

  await openSafetyMenu(page);
  await page.getByTestId("block-toggle").click();
  const dialog = page.getByRole("dialog", { name: "Block this user?" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: "Block" }).click();

  await openSafetyMenu(page);
  await expect(page.getByTestId("block-toggle")).toHaveText(/Unblock/, { timeout: 10_000 });

  // Unblock has no confirmation step (only blocking does) - a direct click.
  await page.getByTestId("block-toggle").click();
  await openSafetyMenu(page);
  await expect(page.getByTestId("block-toggle")).toHaveText(/^Block$/, { timeout: 10_000 });

  await expect(page.getByTestId("follow-toggle")).toBeVisible();
  await expect(page.getByTestId("follow-toggle")).toHaveText(/^Follow$/);

  await mongoose.connect(process.env.MONGO_URI!);
  const followEdge = await Follow.findOne({ follower: huxa!._id, following: huxb!._id });
  expect(followEdge).toBeNull();
  await mongoose.disconnect();
});

test("the Block confirmation discloses interaction restriction and non-restoring Follow removal", async ({ page }) => {
  await login(page, "huxa@test.com", "Password123!");
  await page.goto("/u/huxb");

  await openSafetyMenu(page);
  await page.getByTestId("block-toggle").click();

  const dialog = page.getByRole("dialog", { name: "Block this user?" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const dialogText = ((await dialog.textContent()) || "").toLowerCase();

  expect(dialogText).toContain("follow relationship");
  expect(dialogText).toContain("unblocking");
  expect(dialogText).toContain("won't restore");
  expect(dialogText).toContain("message");
  expect(dialogText).toContain("comment");
  expect(dialogText).toContain("repost");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
});
