import { describe, expect, it } from "vitest";
import { checkCommunityFinalizationThreshold } from "@/lib/communityThresholds";
import { evaluateCommunityTrust } from "@/lib/trustEvaluation";

describe("community trust finalization", () => {
  it("does not finalize when there are too few votes", () => {
    const result = checkCommunityFinalizationThreshold({
      accurateVotes: 4,
      inaccurateVotes: 1,
      accurateWeight: 5,
      inaccurateWeight: 1,
    });

    expect(result.thresholdReached).toBe(false);
    expect(result.reason).toBe("Minimum vote count not reached.");
  });

  it("does not finalize when the leading side lacks enough supporting votes", () => {
    const result = checkCommunityFinalizationThreshold({
      accurateVotes: 4,
      inaccurateVotes: 3,
      accurateWeight: 6,
      inaccurateWeight: 2,
    });

    expect(result.thresholdReached).toBe(false);
    expect(result.reason).toBe("Not enough votes on the leading outcome.");
  });

  it("does not finalize when consensus ratio is too weak", () => {
    const result = checkCommunityFinalizationThreshold({
      accurateVotes: 5,
      inaccurateVotes: 2,
      accurateWeight: 5,
      inaccurateWeight: 3,
    });

    expect(result.thresholdReached).toBe(false);
    expect(result.reason).toBe("Community consensus is not strong enough for finalization.");
  });

  it("finalizes as verified when strong weighted consensus is reached", () => {
    const result = evaluateCommunityTrust({
      accurateVotes: 6,
      inaccurateVotes: 1,
      accurateWeight: 8,
      inaccurateWeight: 1,
    });

    expect(result).not.toBeNull();
    expect(result?.shouldFinalize).toBe(true);
    expect(result?.finalStatus).toBe("verified");
  });

  it("finalizes as false when strong weighted consensus is against the post", () => {
    const result = evaluateCommunityTrust({
      accurateVotes: 1,
      inaccurateVotes: 6,
      accurateWeight: 1,
      inaccurateWeight: 8,
    });

    expect(result).not.toBeNull();
    expect(result?.shouldFinalize).toBe(true);
    expect(result?.finalStatus).toBe("false");
  });
});