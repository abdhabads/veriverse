import PostTrustSnapshot from "@/models/PostTrustSnapshot";

export async function snapshotCurrentPostTrustState(post: any) {
  const existing = await PostTrustSnapshot.findOne({
    post: post._id,
    trustDecisionVersion: Number(post.trustDecisionVersion || 1),
  });

  if (existing) {
    return existing;
  }

  return await PostTrustSnapshot.create({
    post: post._id,
    trustDecisionVersion: Number(post.trustDecisionVersion || 1),

    content: post.content,
    status: post.status,
    aiLabel: post.aiLabel,
    aiRiskScore: post.aiRiskScore,
    verificationScore: Number(post.verificationScore || 0),
    moderationReasons: post.moderationReasons || [],
    hashtags: post.hashtags || [],
    needsExpertReview: Boolean(post.needsExpertReview),
    expertDecision: post.expertDecision || "",
    finalized: Boolean(post.finalized),
    finalizedAt: post.finalizedAt || null,
    accurateVotes: Number(post.accurateVotes || 0),
    inaccurateVotes: Number(post.inaccurateVotes || 0),
    accurateWeight: Number(post.accurateWeight || 0),
    inaccurateWeight: Number(post.inaccurateWeight || 0),
    groundingStatus: post.groundingStatus || "not_checked",
    groundingSummary: post.groundingSummary || "",
    groundingSources: post.groundingSources || [],
    trustEvaluationState: post.trustEvaluationState || "pending",
  });
}
