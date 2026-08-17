// lib/contradictionForcing.ts

/**
 * Contradiction forcing determines whether a post's status should be
 * escalated based purely on contradiction evidence strength, regardless
 * of its AI risk score.
 *
 * This prevents a low AI risk score from masking a well-evidenced contradiction.
 */

export type ContradictionForcingInput = {
  contradictionCount: number;
  groundingConfidence: number;
  currentStatus: string;
};

export type ContradictionForcingResult =
  | { forced: true; targetStatus: "flagged"; reason: string }
  | { forced: false };

/**
 * Returns a forcing decision if contradiction evidence is strong enough
 * to override normal routing. Returns { forced: false } otherwise.
 */
export function evaluateContradictionForcing(
  input: ContradictionForcingInput
): ContradictionForcingResult {
  const { contradictionCount, groundingConfidence, currentStatus } = input;

  // Already in a stronger review state - don't downgrade
  if (
    currentStatus === "under_expert_review" ||
    currentStatus === "under_appeal_review" ||
    currentStatus === "flagged"
  ) {
    return { forced: false };
  }

  // Strong forcing condition: multiple contradictions with high confidence
  if (contradictionCount >= 2 && groundingConfidence >= 0.7) {
    return {
      forced: true,
      targetStatus: "flagged",
      reason: `Contradiction forcing: ${contradictionCount} contradictions at ${(groundingConfidence * 100).toFixed(0)}% grounding confidence`,
    };
  }

  // High-confidence single contradiction
  if (contradictionCount >= 1 && groundingConfidence >= 0.85) {
    return {
      forced: true,
      targetStatus: "flagged",
      reason: `Contradiction forcing: high-confidence contradiction at ${(groundingConfidence * 100).toFixed(0)}% grounding confidence`,
    };
  }

  return { forced: false };
}
