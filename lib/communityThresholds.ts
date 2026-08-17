
import { TRUST_CONFIG } from "@/lib/trustConfig";

type CommunityThresholdInput = {
  accurateVotes: number;
  inaccurateVotes: number;
  accurateWeight: number;
  inaccurateWeight: number;
};

export type CommunityThresholdResult = {
  thresholdReached: boolean;
  reason: string;
};

export function checkCommunityFinalizationThreshold(
  input: CommunityThresholdInput
): CommunityThresholdResult {
  const cfg = TRUST_CONFIG.communityFinalization;
  const totalVotes = input.accurateVotes + input.inaccurateVotes;
  const totalWeight = input.accurateWeight + input.inaccurateWeight;
  const weightDelta = Math.abs(input.accurateWeight - input.inaccurateWeight);
  const winningVoteCount = Math.max(input.accurateVotes, input.inaccurateVotes);
  const winningWeight = Math.max(input.accurateWeight, input.inaccurateWeight);
  const consensusRatio = totalWeight > 0 ? winningWeight / totalWeight : 0;

  if (totalVotes < cfg.minimumVoteCount) {
    return {
      thresholdReached: false,
      reason: "Minimum vote count not reached.",
    };
  }

  if (winningVoteCount < cfg.minimumWinningVoteCount) {
    return {
      thresholdReached: false,
      reason: "Not enough votes on the leading outcome.",
    };
  }

  if (totalWeight < cfg.minimumTotalWeight) {
    return {
      thresholdReached: false,
      reason: "Minimum total weight not reached.",
    };
  }

  if (weightDelta < cfg.minimumWeightDelta) {
    return {
      thresholdReached: false,
      reason: "Weight difference is too small for finalization.",
    };
  }

  if (consensusRatio < cfg.minimumConsensusRatio) {
    return {
      thresholdReached: false,
      reason: "Community consensus is not strong enough for finalization.",
    };
  }

  return {
    thresholdReached: true,
    reason: "Community threshold reached.",
  };
}
