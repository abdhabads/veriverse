import Referral from "@/models/Referral";
import User from "@/models/User";
import Post from "@/models/Post";

const COMMUNITY_BUILDER_THRESHOLD = 5;

// V1 activation rule, owned exclusively here so it is never duplicated
// across routes: onboarding completed + at least one genuine post created.
// Activation happens once - the "status: joined" filter on the final update
// makes this safe to call repeatedly (idempotent no-op once activated, and
// safe under a race between the two call sites below).
export async function tryActivateReferral(userId: string): Promise<void> {
  const referral = await Referral.findOne({
    referredUser: userId,
    status: "joined",
  }).select("_id");

  if (!referral) return;

  const user = await User.findById(userId).select("onboardingCompleted");
  if (!user?.onboardingCompleted) return;

  const hasPost = await Post.exists({ author: userId });
  if (!hasPost) return;

  await Referral.updateOne(
    { _id: referral._id, status: "joined" },
    { $set: { status: "activated", activatedAt: new Date() } }
  );
}

// Display-only recognition, derived purely from activatedCount. Never
// touches User.badges, reputation, rewardPoints, or either Log model.
export function getCommunityBuilderTier(activatedCount: number): {
  tier: "none" | "community_builder";
  progressToNextTier: number;
  nextTierThreshold: number;
} {
  const isCommunityBuilder = activatedCount >= COMMUNITY_BUILDER_THRESHOLD;

  return {
    tier: isCommunityBuilder ? "community_builder" : "none",
    progressToNextTier: Math.min(activatedCount, COMMUNITY_BUILDER_THRESHOLD),
    nextTierThreshold: COMMUNITY_BUILDER_THRESHOLD,
  };
}
