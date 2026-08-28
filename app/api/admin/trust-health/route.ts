import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/apiResponse";
import Post from "@/models/Post";
import Appeal from "@/models/Appeal";

function clampLimit(input: string | null) {
  const value = Number(input || 50);
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.floor(value), 1), 200);
}

export async function GET(req: Request) {
  try {
    const admin = await getUserFromRequest(req);

    if (!admin || admin.role !== "admin") {
      return fail("Admin access required", 403);
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const limit = clampLimit(searchParams.get("limit"));

    const reviewStatuses = ["flagged", "under_expert_review", "under_appeal_review"];
    const activeAppealStatuses = ["pending", "under_review"];

    const [
      totalPosts,
      flaggedPosts,
      highRiskPosts,
      expertReviewPosts,
      appealReviewPosts,
      insufficientEvidencePosts,
      contradictedEvidencePosts,
      pendingEvaluationPosts,
      reopenedEvaluationPosts,
      finalizedPosts,
      activeAppeals,
      activeAppealsByPost,
      avgVerificationResult,
      lowVerificationCount,
      verificationDistribution,
      posts,
    ] = await Promise.all([
      Post.countDocuments(),
      Post.countDocuments({ status: "flagged" }),
      Post.countDocuments({ aiRiskScore: { $gte: 35 } }),
      Post.countDocuments({ status: "under_expert_review" }),
      Post.countDocuments({ status: "under_appeal_review" }),
      Post.countDocuments({ groundingStatus: "insufficient_evidence" }),
      Post.countDocuments({ contradictionCount: { $gte: 1 } }),
      Post.countDocuments({ trustEvaluationState: "pending" }),
      Post.countDocuments({ trustEvaluationState: "reopened" }),
      Post.countDocuments({ finalized: true }),
      Appeal.countDocuments({ status: { $in: activeAppealStatuses } }),
      Appeal.aggregate([
        { $match: { status: { $in: activeAppealStatuses } } },
        { $group: { _id: "$post", count: { $sum: 1 } } },
      ]),
      // All three verification-score metrics below exclude
      // "question"/"instruction" posts - grounding is skipped for those, so
      // their verificationScore is a structural default (not a real "weak
      // evidence" signal). Mixing them in would reintroduce the same
      // category error the contentType classifier fixed at the per-post
      // verdict layer, just at the dashboard-metrics layer instead. $nin
      // also matches documents missing the field entirely (posts created
      // before this field existed), which is correct - those are ordinary
      // claims.
      Post.aggregate([
        { $match: { contentType: { $nin: ["question", "instruction"] } } },
        { $group: { _id: null, avg: { $avg: "$verificationScore" } } },
      ]),
      Post.countDocuments({
        verificationScore: { $lt: 0.3, $gt: 0 },
        contentType: { $nin: ["question", "instruction"] },
      }),
      Post.aggregate([
        { $match: { contentType: { $nin: ["question", "instruction"] } } },
        {
          $bucket: {
            groupBy: "$verificationScore",
            boundaries: [0, 0.3, 0.6, 0.8, 1.01],
            default: "unscored",
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Post.find({
        $or: [
          { aiRiskScore: { $gte: 20 } },
          { status: { $in: reviewStatuses } },
          { groundingStatus: "insufficient_evidence" },
          { contradictionCount: { $gte: 1 } },
          { trustEvaluationState: { $in: ["pending", "reopened"] } },
          { appealCount: { $gte: 1 } },
        ],
      })
        .sort({ aiRiskScore: -1, updatedAt: -1 })
        .limit(limit)
        .populate("author", "username reputation")
        .lean(),
    ]);

    const activeAppealMap = new Map(
      activeAppealsByPost.map((item: { _id: string; count: number }) => [String(item._id), item.count])
    );

    const items = posts.map((post: any) => {
      const postId = String(post._id);
      const activeAppealCount = activeAppealMap.get(postId) || 0;
      const healthTags: string[] = [];

      if (Number(post.aiRiskScore || 0) >= 35) healthTags.push("high_risk");
      if (post.status === "flagged") healthTags.push("flagged");
      if (post.status === "under_expert_review") healthTags.push("expert_review");
      if (post.status === "under_appeal_review") healthTags.push("appeal_review");
      if (post.groundingStatus === "insufficient_evidence") healthTags.push("insufficient_evidence");
      if (Number(post.contradictionCount || 0) >= 1) healthTags.push("contradicted_evidence");
      if (post.trustEvaluationState === "pending") healthTags.push("pending_evaluation");
      if (post.trustEvaluationState === "reopened") healthTags.push("reopened");
      if (activeAppealCount > 0) healthTags.push("active_appeal");
      if (post.contentType === "question" || post.contentType === "instruction") {
        healthTags.push("non_claim");
      }

      return {
        _id: postId,
        content: post.content,
        status: post.status,
        aiRiskScore: Number(post.aiRiskScore || 0),
        verificationScore: Number(post.verificationScore ?? 0),
        contentType: post.contentType || "claim",
        moderationReasons: post.moderationReasons || [],
        groundingStatus: post.groundingStatus,
        groundingSummary: post.groundingSummary || "",
        groundingConfidence: Number(post.groundingConfidence || 0),
        contradictionCount: Number(post.contradictionCount || 0),
        supportCount: Number(post.supportCount || 0),
        trustEvaluationState: post.trustEvaluationState,
        finalized: Boolean(post.finalized),
        appealCount: Number(post.appealCount || 0),
        activeAppealCount,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: {
          username: post.author?.username || "Unknown",
          reputation: Number(post.author?.reputation || 0),
        },
        healthTags,
      };
    });

    return ok({
      summary: {
        totalPosts,
        flaggedPosts,
        highRiskPosts,
        expertReviewPosts,
        appealReviewPosts,
        insufficientEvidencePosts,
        contradictedEvidencePosts,
        pendingEvaluationPosts,
        reopenedEvaluationPosts,
        finalizedPosts,
        activeAppeals,
        avgVerificationScore: Number((avgVerificationResult[0]?.avg ?? 0).toFixed(3)),
        lowVerificationCount,
        verificationDistribution,
      },
      items,
      limit,
    });
  } catch (error) {
    console.error("GET /api/admin/trust-health error:", error);
    return fail("Failed to fetch trust health", 500);
  }
}