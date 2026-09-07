// Sprint 6.5: a refinement of lib/promotionBenchmark.ts's
// classifyFailureSeverity (kept unmodified, since it produced the frozen
// Sprint 6 baseline) into the 4-tier, danger-weighted model requested for
// the calibration study: correct / conservative-but-acceptable /
// materially-wrong / dangerously-wrong, plus a numeric weight per outcome
// type. New file, not a change to lib/promotionBenchmark.ts.
//
// The weights below are EXPLICITLY a research hypothesis, not a validated
// cost model - stated as such wherever they're used in a report. They
// exist so a benchmark's results can be summed into a single
// "danger-weighted error rate" without pretending that number is more
// than a first, crude approximation of relative risk.

export type Direction = "supports" | "contradicts" | "contested" | "insufficient";

export type DangerTier = "correct" | "conservative_acceptable" | "materially_wrong" | "dangerously_wrong";

// "Conservative uncertainty" from the review's table is realized here as
// TWO distinguishable cases rather than one: missing a real direction
// entirely (missed_support/missed_contradiction - the system had a chance
// to find true support/contradiction and stayed uncommitted instead) is
// weighted higher than direction_confusion (ground truth itself has no
// single clear direction - "insufficient" vs. "contested" is a
// disagreement about WHY nothing resolved, not a failure to detect
// something real). There is no separate, third "the system was
// appropriately humble" case beyond these two - staying uncommitted is
// either a miss (a real direction existed) or a non-issue (ground truth
// agrees nothing resolved), never a distinct third outcome.
export type ErrorType =
  | "correct"
  | "missed_support" // ground truth supports, system says insufficient/contested
  | "missed_contradiction" // ground truth contradicts, system says insufficient/contested
  | "false_support" // system says supports, ground truth is anything else
  | "false_contradiction" // system says contradicts, ground truth is anything else
  | "direction_confusion"; // ground truth and observed are both "contested" vs "insufficient" - a low-stakes disagreement about WHY, not a commitment error

// Hypothesis weights, per the review's own table. VERY_HIGH deliberately
// weighted more than double HIGH - a false directional verdict is not
// "somewhat worse" than a missed one, it actively misinforms.
export const DANGER_WEIGHTS: Record<ErrorType, number> = {
  correct: 0,
  direction_confusion: 1, // Low - neither side is a confident wrong commitment
  missed_support: 2, // Moderate
  missed_contradiction: 3, // High
  false_support: 5, // Very high
  false_contradiction: 5, // Very high
};

export const ERROR_TYPE_TO_TIER: Record<ErrorType, DangerTier> = {
  correct: "correct",
  direction_confusion: "conservative_acceptable",
  missed_support: "materially_wrong",
  missed_contradiction: "materially_wrong",
  false_support: "dangerously_wrong",
  false_contradiction: "dangerously_wrong",
};

export function classifyErrorType(expected: Direction, observed: Direction): ErrorType {
  if (expected === observed) return "correct";

  if (observed === "supports") return "false_support";
  if (observed === "contradicts") return "false_contradiction";

  // observed is "insufficient" or "contested" - the system did not commit
  // to a direction. Whether that's conservative-and-safe or a missed call
  // depends entirely on what the ground truth actually was.
  if (expected === "supports") return "missed_support";
  if (expected === "contradicts") return "missed_contradiction";

  // expected is "insufficient" or "contested" and observed is the other of
  // the two - both are "did not commit," just disagreeing on the reason why.
  return "direction_confusion";
}

export function classifyDangerTier(expected: Direction, observed: Direction): DangerTier {
  return ERROR_TYPE_TO_TIER[classifyErrorType(expected, observed)];
}

export function dangerWeight(expected: Direction, observed: Direction): number {
  return DANGER_WEIGHTS[classifyErrorType(expected, observed)];
}

// Aggregate metric across many cases - a HYPOTHESIS-weighted rate, not a
// validated cost function. mean weight per case; 0 = perfect, higher = worse.
export function dangerWeightedErrorRate(pairs: Array<{ expected: Direction; observed: Direction }>): number {
  if (pairs.length === 0) return 0;
  const total = pairs.reduce((sum, p) => sum + dangerWeight(p.expected, p.observed), 0);
  return Math.round((total / pairs.length) * 1000) / 1000;
}
