import PostTrustSnapshot from "@/models/PostTrustSnapshot";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";

// Best-effort: looks up the claim assessment version that is CURRENT right
// now for this post's claim, so the snapshot can cross-reference exactly
// what the claim's evidence picture looked like at this moment (Phase 7/8).
// Never throws - a lookup failure here must not block the post-trust
// snapshot itself, which existing callers depend on.
async function resolveClaimAssessmentReference(claimId: unknown) {
  if (!claimId) return { claimAssessmentVersionAtSnapshot: null, trustAssessmentId: null };
  try {
    const claim = await Claim.findById(claimId).select("currentAssessmentVersion");
    if (!claim) return { claimAssessmentVersionAtSnapshot: null, trustAssessmentId: null };

    const assessment = await TrustAssessment.findOne({
      claim: claim._id,
      claimAssessmentVersion: claim.currentAssessmentVersion,
    }).select("_id");

    return {
      claimAssessmentVersionAtSnapshot: claim.currentAssessmentVersion,
      trustAssessmentId: assessment?._id ?? null,
    };
  } catch {
    return { claimAssessmentVersionAtSnapshot: null, trustAssessmentId: null };
  }
}

export async function snapshotCurrentPostTrustState(post: any) {
  const existing = await PostTrustSnapshot.findOne({
    post: post._id,
    trustDecisionVersion: Number(post.trustDecisionVersion || 1),
  });

  if (existing) {
    return existing;
  }

  const { claimAssessmentVersionAtSnapshot, trustAssessmentId } =
    await resolveClaimAssessmentReference(post.claimId);

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

    claimId: post.claimId || null,
    claimAssessmentVersionAtSnapshot,
    trustAssessmentId,
  });
}
