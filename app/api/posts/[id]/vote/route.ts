
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import Vote from "@/models/Vote";
import User from "@/models/User";
import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";
import Notification from "@/models/Notification";
import { getUserIdFromRequest } from "@/lib/auth";
import { calculateBadges } from "@/lib/badges";
import { getVotingWeight } from "@/lib/votingWeight";
import { canUserVote, getTodayKey } from "@/lib/antiAbuse";
import { applySuspicionPenalty, reduceRiskScore } from "@/lib/riskScore";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { setPostTrustStatus } from "@/lib/setPostTrustStatus";
import { ensureTrustSettlementOnce } from "@/lib/trustSettlementGuard";
import { evaluateCommunityTrust } from "@/lib/trustEvaluation";
import { settleTrustOutcome } from "@/lib/trustSettlement";
import { canCommunityFinalizePost } from "@/lib/trustFinalization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "vote", userId),
      windowMs: 60 * 1000,
      max: 20,
      message: "Too many vote requests. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const voter = await User.findById(userId);
    if (!voter) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const abuseCheck = canUserVote({
      accountCreatedAt: voter.createdAt,
      lastVoteAt: voter.lastVoteAt,
      dailyVoteCount: voter.dailyVoteCount || 0,
      dailyVoteCountDate: voter.dailyVoteCountDate || "",
      riskScore: voter.riskScore || 0,
    });
    if (!abuseCheck.allowed) {
      return NextResponse.json(
        { success: false, message: abuseCheck.message || "Voting restricted" },
        { status: 429 }
      );
    }

    const { id: postId } = await context.params;
    const { voteType } = await req.json();
    if (!["accurate", "inaccurate"].includes(voteType)) {
      return NextResponse.json(
        { success: false, message: "Invalid vote type" },
        { status: 400 }
      );
    }

    const post = await Post.findById(postId);
    if (!post) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    if (String(post.author) === String(voter._id)) {
      return NextResponse.json(
        { success: false, message: "You cannot vote on your own post" },
        { status: 400 }
      );
    }

    if (post.finalized) {
      return NextResponse.json(
        { success: false, message: "This post has already been finalized" },
        { status: 409 }
      );
    }

    const existingVote = await Vote.findOne({ post: postId, user: userId });
    if (existingVote) {
      const updatedRisk = applySuspicionPenalty(
        voter.riskScore || 0,
        voter.suspiciousFlags || 0
      );
      voter.riskScore = updatedRisk.riskScore;
      voter.suspiciousFlags = updatedRisk.suspiciousFlags;
      await voter.save();
      return NextResponse.json(
        { success: false, message: "You already voted on this post" },
        { status: 409 }
      );
    }

    const today = getTodayKey();
    if (voter.dailyVoteCountDate !== today) {
      voter.dailyVoteCountDate = today;
      voter.dailyVoteCount = 0;
    }

    const weight = getVotingWeight(voter.reputation);

    await Vote.create({
      post: postId,
      user: userId,
      voteType,
      weight,
    });

    voter.lastVoteAt = new Date();
    voter.dailyVoteCount = (voter.dailyVoteCount || 0) + 1;
    voter.riskScore = reduceRiskScore(voter.riskScore || 0);
    await voter.save();

    if (voteType === "accurate") {
      post.accurateVotes += 1;
      post.accurateWeight += weight;
    } else {
      post.inaccurateVotes += 1;
      post.inaccurateWeight += weight;
    }


    // Check if post is eligible for community finalization
    if (!canCommunityFinalizePost(post)) {
      await post.save();
      return NextResponse.json({
        success: true,
        message: "Vote recorded",
        post,
      });
    }


    await post.save();

    if (!canCommunityFinalizePost(post)) {
      return NextResponse.json({
        success: true,
        message: "Vote recorded. Post is not eligible for community finalization.",
        post,
      });
    }

    const evaluation = evaluateCommunityTrust({
      accurateVotes: post.accurateVotes,
      inaccurateVotes: post.inaccurateVotes,
      accurateWeight: post.accurateWeight,
      inaccurateWeight: post.inaccurateWeight,
    });

    if (!evaluation || !evaluation.shouldFinalize) {
      return NextResponse.json({
        success: true,
        message: "Vote recorded",
        post,
      });
    }

    const communityEventType =
      evaluation.finalStatus === "verified"
        ? "community_finalize_verified"
        : evaluation.finalStatus === "false"
        ? "community_finalize_false"
        : "community_finalize_disputed";

    const settlementCheck = await ensureTrustSettlementOnce({
      postId: String(post._id),
      trustDecisionVersion: Number(post.trustDecisionVersion || 1),
      eventType: communityEventType,
      metadata: {
        finalStatus: evaluation.finalStatus,
        ...evaluation.metadata,
      },
    });

// Duplicate and misplaced code removed after main POST handler

    if (!settlementCheck.shouldApply) {
      return NextResponse.json({
        success: true,
        message: "Trust settlement already applied for this version",
        post,
      });
    }

    setPostTrustStatus(post, evaluation.finalStatus);
    post.finalized = true;
    post.finalizedAt = new Date();
    post.trustEvaluationState = "finalized";
    post.lastTrustEvaluatedAt = new Date();
    await post.save();

    const author = await User.findById(post.author);
    if (!author) {
      return NextResponse.json(
        { success: false, message: "Post author not found" },
        { status: 404 }
      );
    }

    await settleTrustOutcome({
      post,
      author,
      evaluation,
      trustEventKey: settlementCheck.eventKey,
    });

    await Notification.create({
      user: author._id,
      type: evaluation.finalStatus === "verified" ? "post_verified" : "post_flagged",
      message:
        evaluation.finalStatus === "verified"
          ? "Your post has been verified by community review."
          : evaluation.finalStatus === "false"
          ? "Your post has been marked false after community review."
          : "Your post has been marked disputed after community review.",
      referencePost: post._id,
    });

    return NextResponse.json({
      success: true,
      message: "Vote submitted and post finalized",
      post,
    });
  } catch (error) {
    console.error("POST /api/posts/[id]/vote error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to submit vote" },
      { status: 500 }
    );
  }
}
