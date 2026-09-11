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

test("public profile exposes Block and Mute to another viewer, never on your own profile", async ({ page }) => {
  await login(page, "huxa@test.com", "Password123!");

  await page.goto("/u/huxb");
  await expect(page.getByTestId("block-toggle")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("mute-toggle")).toBeVisible();

  await page.goto("/u/huxa");
  await expect(page.getByTestId("block-toggle")).not.toBeVisible({ timeout: 10_000 });
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

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("block-toggle").click();

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

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("block-toggle").click();
  await expect(page.getByTestId("block-toggle")).toHaveText(/Unblock/, { timeout: 10_000 });

  await page.getByTestId("block-toggle").click();
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

  let dialogMessage = "";
  page.once("dialog", (dialog) => {
    dialogMessage = dialog.message();
    dialog.dismiss();
  });

  await page.getByTestId("block-toggle").click();
  await expect.poll(() => dialogMessage).not.toBe("");

  const normalized = dialogMessage.toLowerCase();
  expect(normalized).toContain("follow relationship");
  expect(normalized).toContain("unblocking");
  expect(normalized).toContain("won't restore");
  expect(normalized).toContain("message");
  expect(normalized).toContain("comment");
  expect(normalized).toContain("repost");
});
