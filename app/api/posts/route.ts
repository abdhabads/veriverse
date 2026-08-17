import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import User from "@/models/User";
import { getUserIdFromRequest } from "@/lib/auth";
import { evaluateContentTruthPipeline } from "@/lib/aiTruthPipeline";
import { extractHashtags } from "@/lib/hashtags";
import UserRelation from "@/models/UserRelation";
import { requiresExpertReview } from "@/lib/expertReview";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanString } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";
import { evaluateContradictionForcing } from "@/lib/contradictionForcing";
import { TrustStatus } from "@/lib/trustTransitions";
import { recordTrustEvent } from "@/lib/trustEvents";

export async function POST(req: Request) {
  await connectDB();

  try {
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return fail("Unauthorized", 401);
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "create_post", userId),
      windowMs: 60 * 1000,
      max: 8,
      message: "You are posting too quickly. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();
    const cleanedContent = cleanString(body.content, { maxLength: 1000 });

    if (!cleanedContent) {
      return fail("Content is required and must be under 1000 characters.", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return fail("User not found", 404);
    }

    const hashtags = extractHashtags(cleanedContent);
    const screening = await evaluateContentTruthPipeline(cleanedContent);
    const needsExpertReview = requiresExpertReview(
      cleanedContent,
      hashtags,
      screening.aiRiskScore,
      screening.groundingStatus,
      screening.groundingSources,
      screening.groundingConfidence,
      screening.contradictionCount
    );

    const contradictionCount = screening.contradictionCount ?? 0;
    const groundingConfidence = screening.groundingConfidence ?? 0;
    const aiLabel = screening.aiLabel;
    const groundingStatus = screening.groundingStatus;

    const forcingResult = evaluateContradictionForcing({
      contradictionCount: contradictionCount ?? 0,
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
    } else if (aiLabel === "high_risk" && needsExpertReview) {
      // High-risk sensitive topics (medical, health claims) go to expert review
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

    const post = await Post.create({
      author: userId,
      content: cleanedContent,
      hashtags,
       // When routing to expert review, use "needs_review" label for clarity
       aiLabel: status === "under_expert_review" && screening.aiLabel === "high_risk" 
         ? "needs_review"
         : screening.aiLabel,
      aiRiskScore: screening.aiRiskScore,
      verificationScore: screening.verificationScore || 0,
      moderationReasons: screening.moderationReasons,
      groundingStatus: screening.groundingStatus,
      groundingSummary: screening.groundingSummary,
      groundingSources: screening.groundingSources,
      groundingConfidence: screening.groundingConfidence || 0,
      contradictionCount: screening.contradictionCount || 0,
      supportCount: screening.supportCount || 0,
      aiProvider: screening.provider || "",
      needsExpertReview,
      status,

      trustDecisionVersion: 1,
      trustEvaluationState: "evaluated",
      lastTrustEvaluatedAt: new Date(),
    });

    if (contradictionForcingApplied && forcingResult.forced) {
      await recordTrustEvent({
        postId: String(post._id),
        trustDecisionVersion: Number(post.trustDecisionVersion || 1),
        eventType: "contradiction_forced",
        metadata: {
          contradictionCount: screening.contradictionCount,
          groundingConfidence: screening.groundingConfidence,
          reason: forcingResult.reason,
        },
      });
    }

    await post.populate("author", "username reputation avatarUrl badges");

    const normalizedPost = {
      ...post.toObject(),
      likesCount: Number(post.likesCount || 0),
      repostsCount: Number(post.repostsCount || 0),
      accurateVotes: Number(post.accurateVotes || 0),
      inaccurateVotes: Number(post.inaccurateVotes || 0),
      hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
      score: 0,
    };

    return ok({
      message: "Post created successfully",
      post: normalizedPost,
    }, 201);
  } catch (error) {
    console.error("POST /api/posts error:", error);
    return fail("Failed to create post", 500);
  }
}

export async function GET(req: Request) {
  await connectDB();

  try {
    const requesterId = getUserIdFromRequest(req);

    let excludedAuthorIds: string[] = [];

    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");

      excludedAuthorIds = relations.map((item: any) => String(item.targetUser));
    }

    const posts = await Post.find(
      excludedAuthorIds.length > 0
        ? { author: { $nin: excludedAuthorIds } }
        : {}
    )
      .populate("author", "username reputation avatarUrl badges")
      .sort({ createdAt: -1 })
      .limit(20);

    const normalizedPosts = posts.map((post: any) => {
      const likesCount = Number(post.likesCount || 0);
      const repostsCount = Number(post.repostsCount || 0);
      const accurateVotes = Number(post.accurateVotes || 0);
      const inaccurateVotes = Number(post.inaccurateVotes || 0);

      const engagement =
        likesCount * 2 + repostsCount * 3 + accurateVotes + inaccurateVotes;

      const freshness =
        (Date.now() - new Date(post.createdAt).getTime()) / 1000000;

      const score = engagement - freshness;

      return {
        ...post.toObject(),
        likesCount,
        repostsCount,
        accurateVotes,
        inaccurateVotes,
        hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
        score,
      };
    });

    normalizedPosts.sort((a, b) => b.score - a.score);

    const verifiedPosts = normalizedPosts.filter(
      (post) => post.status === "verified"
    );

    const trendingPosts = [...normalizedPosts]
      .sort(
        (a, b) =>
          (b.likesCount + b.repostsCount + b.accurateVotes + b.inaccurateVotes) -
          (a.likesCount + a.repostsCount + a.accurateVotes + a.inaccurateVotes)
      )
      .slice(0, 10);

    const res = NextResponse.json({
      success: true,
      posts: normalizedPosts,
      sections: {
        verified: verifiedPosts.slice(0, 10),
        trending: trendingPosts,
      },
    });
    res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res;
  } catch (error) {
    console.error("GET /api/posts error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}
