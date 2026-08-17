import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import Notification from "@/models/Notification";
import RewardLog from "@/models/RewardLog";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";
import { calculateBadges } from "@/lib/badges";
import ReputationLog from "@/models/ReputationLog";
import AuditLog from "@/models/AuditLog";
import { setPostTrustStatus } from "@/lib/setPostTrustStatus";
import { ensureTrustSettlementOnce } from "@/lib/trustSettlementGuard";
import { evaluateExpertTrustOutcome } from "@/lib/trustEvaluation";
import { settleTrustOutcome } from "@/lib/trustSettlement";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  await connectDB();

  try {
    const expert = await getUserFromRequest(req);

    if (!expert || !["expert", "admin"].includes(expert.role)) {
      return NextResponse.json(
        { success: false, message: "Expert or admin access required" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const { decision } = await req.json();

    if (!["verified", "false", "disputed"].includes(decision)) {
      return NextResponse.json(
        { success: false, message: "Invalid expert decision" },
        { status: 400 }
      );
    }

    const post = await Post.findById(id);
    if (!post) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    if (!post.needsExpertReview) {
      return NextResponse.json(
        { success: false, message: "This post does not require expert review" },
        { status: 400 }
      );
    }

    if (post.expertReviewedBy) {
      return NextResponse.json(
        { success: false, message: "This post has already been expert-reviewed" },
        { status: 409 }
      );
    }


    // 1. Evaluate expert outcome
    const evaluation = evaluateExpertTrustOutcome({
      decision,
      expertId: String(expert._id),
    });

    // 2. Guard: ensure settlement is idempotent
    const expertEventType =
      evaluation.finalStatus === "verified"
        ? "expert_finalize_verified"
        : evaluation.finalStatus === "false"
        ? "expert_finalize_false"
        : "expert_finalize_disputed";

    const settlementCheck = await ensureTrustSettlementOnce({
      postId: String(post._id),
      trustDecisionVersion: Number(post.trustDecisionVersion || 1),
      eventType: expertEventType,
      metadata: {
        ...evaluation.metadata,
      },
    });

    if (!settlementCheck.shouldApply) {
      return NextResponse.json({
        success: true,
        message: "Expert trust settlement already applied for this version",
        post,
      });
    }

    // 3. Finalize post
    setPostTrustStatus(post, evaluation.finalStatus);
    post.needsExpertReview = false;
    post.expertDecision = evaluation.finalStatus;
    post.expertReviewedBy = expert._id;
    post.finalized = true;
    post.finalizedAt = new Date();
    post.trustEvaluationState = "finalized";
    post.lastTrustEvaluatedAt = new Date();
    await post.save();

    // 4. Settle consequences
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
          ? "Your post has been verified after expert review."
          : evaluation.finalStatus === "false"
          ? "Your post has been marked false after expert review."
          : "Your post has been marked disputed after expert review.",
      referencePost: post._id,
    });

    let auditActionType: "expert_verified" | "expert_false" | "expert_disputed" =
      "expert_disputed";

    if (decision === "verified") auditActionType = "expert_verified";
    if (decision === "false") auditActionType = "expert_false";

    await AuditLog.create({
      actor: expert._id,
      actorRole: expert.role,
      actionType: auditActionType,
      targetPost: post._id,
      targetUser: post.author,
      note: `Expert review completed with decision: ${decision}.`,
    });

    return NextResponse.json({
      success: true,
      message: "Expert review completed",
      post: {
        id: post._id,
        status: post.status,
        expertDecision: post.expertDecision,
        expertReviewedBy: post.expertReviewedBy,
        finalized: post.finalized,
      },
    });
  } catch (error) {
    console.error("PATCH /api/expert/review/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to complete expert review" },
      { status: 500 }
    );
  }
}
