import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import Post from "@/models/Post";
import User from "@/models/User";
import { findOrCreateClaim } from "@/lib/claimIdentity";

dotenv.config({ path: ".env.test.local" });

const claimIds: mongoose.Types.ObjectId[] = [];
const postIds: mongoose.Types.ObjectId[] = [];
const userIds: mongoose.Types.ObjectId[] = [];

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    Post.deleteMany({ _id: { $in: postIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
  claimIds.length = 0;
  postIds.length = 0;
  userIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

test("rendered smoke: two independently-posted-about claim appears in Search's trending section and links to the claim page", async ({
  page,
}) => {
  const { claim } = await findOrCreateClaim(`Trending smoke claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  // Two freshly created, unquestionably-available authors - the fixture
  // userb@test.com is deliberately seeded as suspended for moderation tests
  // and would be correctly excluded by trending's own moderation filter.
  const suffix = new mongoose.Types.ObjectId().toString();
  const userA = await User.create({
    username: `trendinga_${suffix}`,
    email: `trendinga_${suffix}@test.com`,
    password: "hashed_password_not_real",
  });
  const userB = await User.create({
    username: `trendingb_${suffix}`,
    email: `trendingb_${suffix}@test.com`,
    password: "hashed_password_not_real",
  });
  userIds.push(userA._id, userB._id);

  const postA = await Post.create({
    author: userA._id,
    content: "Trending smoke post from user A about the claim.",
    claimId: claim._id,
  });
  const postB = await Post.create({
    author: userB._id,
    content: "Trending smoke post from user B about the claim.",
    claimId: claim._id,
  });
  postIds.push(postA._id, postB._id);

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/search");

  const trendingSection = page.locator(".vv-card", { hasText: "Trending claims" });
  await expect(trendingSection.getByText(claim.canonicalText)).toBeVisible({ timeout: 15_000 });
  await expect(trendingSection.getByText("Discussed in 2 recent posts")).toBeVisible();

  await Promise.all([
    page.waitForURL(new RegExp(`/claims/${claimId}`)),
    trendingSection.getByRole("link", { name: /view claim analysis/i }).click(),
  ]);
});
