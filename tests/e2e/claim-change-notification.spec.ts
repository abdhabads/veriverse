import dotenv from "dotenv";
import mongoose from "mongoose";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import Claim from "@/models/Claim";
import ClaimFollow from "@/models/ClaimFollow";
import ClaimChangeEvent from "@/models/ClaimChangeEvent";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { findOrCreateClaim } from "@/lib/claimIdentity";
import { recordClaimChangeAndNotify } from "@/lib/claimChangeNotification";

dotenv.config({ path: ".env.test.local" });

const claimIds: mongoose.Types.ObjectId[] = [];

test.beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
});

test.afterEach(async () => {
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    ClaimFollow.deleteMany({ claim: { $in: claimIds } }),
    ClaimChangeEvent.deleteMany({ claim: { $in: claimIds } }),
    Notification.deleteMany({ referenceClaim: { $in: claimIds } }),
  ]);
  claimIds.length = 0;
});

test.afterAll(async () => {
  await mongoose.disconnect();
});

test("rendered smoke: a followed claim's meaningful change produces a notification that navigates to the claim", async ({
  page,
}) => {
  const { claim } = await findOrCreateClaim(`Notification smoke claim ${new mongoose.Types.ObjectId()}`);
  claimIds.push(claim._id);
  const claimId = String(claim._id);

  const follower = await User.findOne({ email: "usera@test.com" });
  if (!follower) throw new Error("Fixture user usera@test.com not found");
  await ClaimFollow.create({ user: follower._id, claim: claim._id });

  await recordClaimChangeAndNotify({
    claimId,
    fromAssessmentVersion: 1,
    toAssessmentVersion: 2,
    changeType: "band_changed",
    fromAssessmentBand: "weakly_supported",
    toAssessmentBand: "contested",
  });

  await login(page, "usera@test.com", "Password123!");
  await page.goto("/notifications");

  const notificationText = page.getByText("A claim you follow is now Contested.");
  await expect(notificationText).toBeVisible({ timeout: 15_000 });

  const openClaimButton = page.getByRole("button", { name: /open the claim referenced by/i });
  await expect(openClaimButton).toBeVisible();

  await Promise.all([page.waitForURL(new RegExp(`/claims/${claimId}`)), openClaimButton.click()]);
});
