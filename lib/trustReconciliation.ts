import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";

type ReconcileTrustEffectsParams = {
  post: any;
  author: any;
  reason: string;
  trustEventKey: string;
};

export async function reconcilePriorTrustEffects(
  params: ReconcileTrustEffectsParams
) {
  const { post, author, reason, trustEventKey } = params;

  // Only reconcile if the post was finalized or is being reopened
  if (!post.finalized && post.trustEvaluationState !== "reopened") {
    return {
      reputationCompensation: 0,
      rewardCompensation: 0,
    };
  }

  const trustDecisionVersion = Number(post.trustDecisionVersion || 1);

  const priorReputationLogs = await ReputationLog.find({
    user: author._id,
    referencePost: post._id,
  }).sort({ createdAt: -1 });

  const priorRewardLogs = await RewardLog.find({
    user: author._id,
    referencePost: post._id,
  }).sort({ createdAt: -1 });

  let reputationCompensation = 0;
  let rewardCompensation = 0;

  for (const log of priorReputationLogs) {
    if (
      ["post_false", "expert_false_post_penalty"].includes(log.actionType) &&
      Number(log.pointsChange || 0) < 0
    ) {
      reputationCompensation += Math.abs(Number(log.pointsChange || 0));
    }

    if (
      ["post_verified", "expert_verified"].includes(log.actionType) &&
      Number(log.pointsChange || 0) > 0
    ) {
      reputationCompensation -= Math.abs(Number(log.pointsChange || 0));
    }
  }

  for (const log of priorRewardLogs) {
    if (
      ["post_verified", "expert_verified"].includes(log.actionType) &&
      Number(log.pointsChange || 0) > 0
    ) {
      rewardCompensation -= Math.abs(Number(log.pointsChange || 0));
    }
  }

  if (reputationCompensation !== 0) {
    author.reputation = Number(author.reputation || 0) + reputationCompensation;

    await ReputationLog.create({
      user: author._id,
      actionType: "appeal_reversal",
      pointsChange: reputationCompensation,
      reason,
      referencePost: post._id,
      trustDecisionVersion,
      trustEventKey,
    });
  }

  if (rewardCompensation !== 0) {
    author.rewardPoints = Number(author.rewardPoints || 0) + rewardCompensation;

    await RewardLog.create({
      user: author._id,
      actionType: "appeal_reversal",
      pointsChange: rewardCompensation,
      reason,
      referencePost: post._id,
      trustDecisionVersion,
      trustEventKey,
    });
  }

  await author.save();

  return {
    reputationCompensation,
    rewardCompensation,
  };
}
