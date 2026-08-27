import { evaluateContradictionForcing } from "@/lib/contradictionForcing";
import { TrustStatus } from "@/lib/trustTransitions";

export type PostStatusCascadeInput = {
  aiLabel: "safe" | "suspicious" | "needs_review" | "high_risk";
  contradictionCount: number;
  groundingConfidence: number; // 0-100
  groundingStatus: "checked" | "insufficient_evidence" | "not_checked";
  verificationScore: number; // 0-1
  needsExpertReview: boolean;
};

export type PostStatusCascadeResult = {
  status: TrustStatus;
  contradictionForcingApplied: boolean;
  contradictionForcingReason?: string;
  evidenceDeescalationApplied: boolean;
};

/**
 * Mirrors the routing cascade in app/api/posts/route.ts. Kept here so it can
 * be unit tested independently of the route's DB/network side effects.
 */
export function determinePostStatus(
  input: PostStatusCascadeInput
): PostStatusCascadeResult {
  const {
    aiLabel,
    contradictionCount,
    groundingConfidence,
    groundingStatus,
    verificationScore,
    needsExpertReview,
  } = input;

  const forcingResult = evaluateContradictionForcing({
    contradictionCount,
    groundingConfidence: groundingConfidence / 100,
    currentStatus: "unverified",
  });

  // Strong, confidently-retrieved supporting evidence with zero contradictions
  // outweighs a merely "suspicious" AI label. This only softens the label-driven
  // flagged branch below - it never runs ahead of expert-review routing, so
  // sensitive-topic posts still reach a human reviewer regardless.
  const evidenceDeescalates =
    contradictionCount === 0 &&
    verificationScore >= 0.7 &&
    groundingConfidence >= 60 &&
    groundingStatus === "checked";

  if (forcingResult.forced) {
    return {
      status: forcingResult.targetStatus,
      contradictionForcingApplied: true,
      contradictionForcingReason: forcingResult.reason,
      evidenceDeescalationApplied: false,
    };
  }

  if (contradictionCount >= 2 && groundingConfidence >= 60) {
    return {
      status: "under_expert_review",
      contradictionForcingApplied: false,
      evidenceDeescalationApplied: false,
    };
  }

  if (aiLabel === "high_risk" && needsExpertReview) {
    // High-risk sensitive topics (medical, health claims) go to expert review
    return {
      status: "under_expert_review",
      contradictionForcingApplied: false,
      evidenceDeescalationApplied: false,
    };
  }

  if (aiLabel === "high_risk") {
    return {
      status: "flagged",
      contradictionForcingApplied: false,
      evidenceDeescalationApplied: false,
    };
  }

  if (needsExpertReview) {
    return {
      status: "under_expert_review",
      contradictionForcingApplied: false,
      evidenceDeescalationApplied: false,
    };
  }

  if (aiLabel === "suspicious" && evidenceDeescalates) {
    return {
      status: "unverified",
      contradictionForcingApplied: false,
      evidenceDeescalationApplied: true,
    };
  }

  if (aiLabel === "suspicious" || groundingStatus === "insufficient_evidence") {
    return {
      status: "flagged",
      contradictionForcingApplied: false,
      evidenceDeescalationApplied: false,
    };
  }

  return {
    status: "unverified",
    contradictionForcingApplied: false,
    evidenceDeescalationApplied: false,
  };
}
