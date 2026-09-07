import { ClaimEvidenceStrengthResult } from "@/lib/evidenceStrength";
import { ClaimContradictionStrengthResult } from "@/lib/contradictionStrength";

// IMPORTANT: this is NOT "probability the claim is true." It answers a
// different question: "how confident are we that the available evidence is
// sufficient and correctly connected to this claim for making a
// verification decision at all?" A claim can have HIGH verification
// confidence and still be false (strong, well-connected evidence that it's
// false) - confidence here is about the assessment process, not the
// proposition. Never surface this as "N% chance true" anywhere.

export type VerificationConfidenceLevel = "high" | "moderate" | "low" | "very_low";

export type VerificationConfidenceResult = {
  level: VerificationConfidenceLevel;
  // 0-1, heuristic. A measure of assessment sufficiency, not truth probability.
  score: number;
  reasons: string[];
  isHeuristic: true;
};

export function assessVerificationConfidence(params: {
  evidenceStrength: ClaimEvidenceStrengthResult;
  contradictionStrength: ClaimContradictionStrengthResult;
  // Distinct independent groups across ALL evidence for this claim
  // (supporting + contradicting + context + unknown) - overall evidence
  // quantity/independence, not just the supporting side.
  totalIndependentGroups: number;
  groundingStatus: "checked" | "insufficient_evidence" | "not_checked";
}): VerificationConfidenceResult {
  const reasons: string[] = [];
  let score = 0;

  const dimensionConfidence =
    (params.evidenceStrength.confidence + params.contradictionStrength.confidence) / 2;
  score += dimensionConfidence * 0.4;
  reasons.push(
    `Average confidence in the underlying strength/contradiction assessments: ${dimensionConfidence.toFixed(2)}.`
  );

  if (params.totalIndependentGroups >= 3) {
    score += 0.25;
    reasons.push("Three or more independent sources contribute evidence.");
  } else if (params.totalIndependentGroups >= 1) {
    score += 0.1;
    reasons.push("Limited independent source coverage (fewer than 3 independent groups).");
  } else {
    reasons.push("No independent evidence sources found.");
  }

  const hasSubstantialSupport =
    params.evidenceStrength.band === "strong" || params.evidenceStrength.band === "moderate";
  const hasSubstantialContradiction =
    params.contradictionStrength.band === "strong" || params.contradictionStrength.band === "moderate";

  if (hasSubstantialSupport && hasSubstantialContradiction) {
    score -= 0.3;
    reasons.push(
      "Substantial supporting AND contradicting evidence both exist - this is an unresolved conflict, which lowers confidence in a clean assessment even though evidence is plentiful."
    );
  } else if (hasSubstantialSupport || hasSubstantialContradiction) {
    score += 0.2;
    reasons.push("Evidence points in one direction without substantial conflict.");
  } else {
    // Neither side has substantial evidence - this must NOT be scored the
    // same as "resolved, no conflict." Found via the Sprint 3 benchmark:
    // 20 independent but individually weak/negligible sources were
    // previously scoring "high" confidence here, because this branch fired
    // on "no conflict" alone without checking whether there was any
    // substantial evidence to not be in conflict.
    score -= 0.15;
    reasons.push("Neither supporting nor contradicting evidence is substantial - low confidence in any assessment, not merely 'no conflict'.");
  }

  if (params.groundingStatus === "insufficient_evidence" || params.groundingStatus === "not_checked") {
    score -= 0.2;
    reasons.push(`Grounding status is "${params.groundingStatus}".`);
  } else {
    score += 0.15;
  }

  score = Math.max(0, Math.min(1, score));

  let level: VerificationConfidenceLevel;
  if (score >= 0.7) level = "high";
  else if (score >= 0.45) level = "moderate";
  else if (score >= 0.2) level = "low";
  else level = "very_low";

  return {
    level,
    score: Math.round(score * 100) / 100,
    reasons,
    isHeuristic: true,
  };
}
