import { TrustEvaluationResult, FinalTrustOutcome } from "@/lib/trustOutcomeTypes";
import { checkCommunityFinalizationThreshold } from "@/lib/communityThresholds";

type CommunityEvaluationInput = {
  accurateWeight: number;
  inaccurateWeight: number;
  accurateVotes: number;
  inaccurateVotes: number;
  minimumTotalWeight?: number;
  minimumVoteCount?: number;
};

export function evaluateCommunityTrust(
  input: CommunityEvaluationInput
): TrustEvaluationResult | null {
  const thresholdCheck = checkCommunityFinalizationThreshold({
    accurateVotes: input.accurateVotes,
    inaccurateVotes: input.inaccurateVotes,
    accurateWeight: input.accurateWeight,
    inaccurateWeight: input.inaccurateWeight,
  });

  if (!thresholdCheck.thresholdReached) {
    return null;
  }

  let finalStatus: FinalTrustOutcome = "disputed";
  let reason = "Community voting resulted in disputed outcome.";

  if (input.accurateWeight > input.inaccurateWeight) {
    finalStatus = "verified";
    reason = "Community voting weighted the post as accurate.";
  } else if (input.inaccurateWeight > input.accurateWeight) {
    finalStatus = "false";
    reason = "Community voting weighted the post as inaccurate.";
  }

  return {
    finalStatus,
    reason,
    source: "community",
    shouldFinalize: true,
    metadata: {
      accurateVotes: input.accurateVotes,
      inaccurateVotes: input.inaccurateVotes,
      accurateWeight: input.accurateWeight,
      inaccurateWeight: input.inaccurateWeight,
      thresholdReason: thresholdCheck.reason,
    },
  };
}

type ExpertEvaluationInput = {
  decision: "verified" | "false" | "disputed";
  expertId: string;
};

export function evaluateExpertTrustOutcome(
  input: ExpertEvaluationInput
): TrustEvaluationResult {
  return {
    finalStatus: input.decision,
    reason: `Expert review completed with decision: ${input.decision}.`,
    source: "expert",
    shouldFinalize: true,
    metadata: {
      expertId: input.expertId,
      decision: input.decision,
    },
  };
}
