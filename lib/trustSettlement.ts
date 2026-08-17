import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";
import Notification from "@/models/Notification";
import { TrustEvaluationResult } from "@/lib/trustOutcomeTypes";

type SettleTrustOutcomeParams = {
  post: any;
  author: any;
  evaluation: TrustEvaluationResult;
  trustEventKey: string;
};

export async function settleTrustOutcome(params: SettleTrustOutcomeParams) {
  const { post, author, evaluation, trustEventKey } = params;

  const trustDecisionVersion = Number(post.trustDecisionVersion || 1);

  if (evaluation.source === "community") {
    if (evaluation.finalStatus === "verified") {
      author.reputation = Number(author.reputation || 0) + 5;
      author.rewardPoints = Number(author.rewardPoints || 0) + 10;
      await author.save();

      await RewardLog.create({
        user: author._id,
        actionType: "post_verified",
        pointsChange: 10,
        reason: "Community finalized your post as verified.",
        referencePost: post._id,
        trustDecisionVersion,
        trustEventKey,
      });

      await ReputationLog.create({
        user: author._id,
        actionType: "post_verified",
        pointsChange: 5,
        reason: "Community finalized your post as verified.",
        referencePost: post._id,
        trustDecisionVersion,
        trustEventKey,
      });

      await Notification.create({
        user: author._id,
        type: "report_update",
        message: "Your post has been finalized as verified by the community.",
        referencePost: post._id,
      });
    } else if (evaluation.finalStatus === "false") {
      author.reputation = Number(author.reputation || 0) - 5;
      await author.save();

      await ReputationLog.create({
        user: author._id,
        actionType: "post_false",
        pointsChange: -5,
        reason: "Community finalized your post as false.",
        referencePost: post._id,
        trustDecisionVersion,
        trustEventKey,
      });

      await Notification.create({
        user: author._id,
        type: "report_update",
        message: "Your post has been finalized as false by the community.",
        referencePost: post._id,
      });
    } else {
      await Notification.create({
        user: author._id,
        type: "report_update",
        message: "Your post has been finalized as disputed by the community.",
        referencePost: post._id,
      });
    }
  }

  if (evaluation.source === "expert") {
    if (evaluation.finalStatus === "verified") {
      author.reputation = Number(author.reputation || 0) + 7;
      author.rewardPoints = Number(author.rewardPoints || 0) + 12;
      await author.save();

      await RewardLog.create({
        user: author._id,
        actionType: "expert_verified",
        pointsChange: 12,
        reason: "Expert review finalized your post as verified.",
        referencePost: post._id,
        trustDecisionVersion,
        trustEventKey,
      });

      await ReputationLog.create({
        user: author._id,
        actionType: "expert_verified",
        pointsChange: 7,
        reason: "Expert review finalized your post as verified.",
        referencePost: post._id,
        trustDecisionVersion,
        trustEventKey,
      });

      await Notification.create({
        user: author._id,
        type: "report_update",
        message: "Your post has been verified by expert review.",
        referencePost: post._id,
      });
    } else if (evaluation.finalStatus === "false") {
      author.reputation = Number(author.reputation || 0) - 7;
      await author.save();

      await ReputationLog.create({
        user: author._id,
        actionType: "expert_false_post_penalty",
        pointsChange: -7,
        reason: "Expert review finalized your post as false.",
        referencePost: post._id,
        trustDecisionVersion,
        trustEventKey,
      });

      await Notification.create({
        user: author._id,
        type: "report_update",
        message: "Your post has been marked false by expert review.",
        referencePost: post._id,
      });
    } else {
      await Notification.create({
        user: author._id,
        type: "report_update",
        message: "Your post remains disputed after expert review.",
        referencePost: post._id,
      });
    }
  }
}
