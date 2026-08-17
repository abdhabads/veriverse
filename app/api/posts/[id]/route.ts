import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";
import { evaluateContentTruthPipeline } from "@/lib/aiTruthPipeline";
import { extractHashtags } from "@/lib/hashtags";
import { requiresExpertReview } from "@/lib/expertReview";
import { cleanString, isValidObjectId } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";
import { setPostTrustStatus } from "@/lib/setPostTrustStatus";
import { snapshotCurrentPostTrustState } from "@/lib/postTrustSnapshots";
import { reopenPostTrustCycle } from "@/lib/reopenPostTrustCycle";
import { recordTrustEvent } from "@/lib/trustEvents";
import { evaluateContradictionForcing } from "@/lib/contradictionForcing";
import { TrustStatus } from "@/lib/trustTransitions";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);
    if (!user) return fail("Unauthorized", 401);

    const userId = String(user._id);
    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "edit_post", String(userId)),
      windowMs: 60 * 1000,
      max: 10,
      message: "You are editing too quickly. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const { id } = await context.params;
    if (!isValidObjectId(id)) return fail("Invalid post ID", 400);

    const body = await req.json();
    const cleanedContent = cleanString(body.content, { maxLength: 1000 });

    if (!cleanedContent) {
      return fail("Content is required and must be under 1000 characters.", 400);
    }

    const post = await Post.findById(id);
    if (!post) return fail("Post not found", 404);


    if (String(post.author) !== String(user._id) && user.role !== "admin") {
      return fail("Forbidden", 403);
    }

    if (post.finalized) {
      return fail("Finalized posts cannot be edited", 409);
    }


    if (post.status === "under_appeal_review" || post.hasActiveAppeal) {
      return fail("Posts under active appeal review cannot be edited.", 409);
    }

    if (post.expertReviewedBy) {
      return fail("Posts that have received expert review cannot be edited.", 409);
    }

    const screening = await evaluateContentTruthPipeline(cleanedContent);
    const hashtags = extractHashtags(cleanedContent);
    const needsExpertReview = requiresExpertReview(
      cleanedContent,
      hashtags,
      screening.aiRiskScore,
      screening.groundingStatus,
      screening.groundingSources,
      screening.groundingConfidence,
      screening.contradictionCount
    );



    await snapshotCurrentPostTrustState(post);
    reopenPostTrustCycle(post);
    await recordTrustEvent({
      postId: String(post._id),
      trustDecisionVersion: Number(post.trustDecisionVersion || 1),
      eventType: "edit_reopen",
      metadata: {
        editorId: String(user._id),
        previousVersion: Number(post.trustDecisionVersion || 1) - 1,
      },
    });

    post.content = cleanedContent;
    post.hashtags = hashtags;
    post.aiLabel = screening.aiLabel;
    post.aiRiskScore = screening.aiRiskScore;
    post.verificationScore = screening.verificationScore || 0;
    post.moderationReasons = screening.moderationReasons;
    post.groundingStatus = screening.groundingStatus;
    post.groundingSummary = screening.groundingSummary;
    post.groundingSources = screening.groundingSources;
    post.groundingConfidence = screening.groundingConfidence || 0;
    post.contradictionCount = screening.contradictionCount || 0;
    post.supportCount = screening.supportCount || 0;
    post.aiProvider = screening.provider || "";
    post.needsExpertReview = needsExpertReview;
    post.lastTrustEvaluatedAt = new Date();

    const contradictionCount = screening.contradictionCount ?? 0;
    const groundingConfidence = screening.groundingConfidence ?? 0;
    const aiLabel = screening.aiLabel;
    const groundingStatus = screening.groundingStatus;

    const forcingResult = evaluateContradictionForcing({
      contradictionCount,
      groundingConfidence: groundingConfidence / 100,
      currentStatus: "unverified",
    });

    let contradictionForcingApplied = false;
    let status: TrustStatus;
    if (forcingResult.forced) {
      status = forcingResult.targetStatus;
      // Record for admin analytics - stored after post is saved below
      contradictionForcingApplied = true;
    } else if (contradictionCount >= 2 && groundingConfidence >= 60) {
      status = "under_expert_review";
    } else if (aiLabel === "high_risk") {
      status = "flagged";
    } else if (needsExpertReview) {
      status = "under_expert_review";
    } else if (aiLabel === "suspicious" || groundingStatus === "insufficient_evidence") {
      status = "flagged";
    } else {
      status = "unverified";
    }
    setPostTrustStatus(post, status);

    await post.save();

    if (contradictionForcingApplied) {
      await recordTrustEvent({
        postId: String(post._id),
        trustDecisionVersion: Number(post.trustDecisionVersion || 1),
        eventType: "contradiction_forced",
        metadata: {
          contradictionCount: screening.contradictionCount,
          groundingConfidence: screening.groundingConfidence,
          reason: "reason" in forcingResult ? forcingResult.reason : undefined,
        },
      });
    }

    return ok({
      message: "Post updated successfully",
      post,
    });
  } catch (error) {
    console.error("PATCH /api/posts/[id] error:", error);
    return fail("Failed to update post", 500);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);
    if (!user) return fail("Unauthorized", 401);

    const { id } = await context.params;
    if (!isValidObjectId(id)) return fail("Invalid post ID", 400);

    const post = await Post.findById(id);
    if (!post) return fail("Post not found", 404);

    if (String(post.author) !== String(user._id) && user.role !== "admin") {
      return fail("Forbidden", 403);
    }

    await Post.findByIdAndDelete(id);

    return ok({
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /api/posts/[id] error:", error);
    return fail("Failed to delete post", 500);
  }
}
