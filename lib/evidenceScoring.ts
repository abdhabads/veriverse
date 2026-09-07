import { SourceType } from "@/lib/sourceAuthority";
import { countDistinctGroups } from "@/lib/sourceIndependence";

// Produces an EXPLAINABLE evidence assessment from structured evidence,
// instead of a single opaque number. This is deliberately NOT wired into
// verificationScore, contradictionForcing, or any status decision yet - see
// lib/groundingMetrics.ts and lib/aiTruthPipeline.ts for how it's exposed
// alongside (not instead of) the existing scoring in Sprint 1. Combining
// Evidence Strength with Contradiction Strength and Verification Confidence
// into one trust assessment is explicitly later-sprint work.
//
// Do not tune the thresholds/weights below against the Sprint 1 benchmark.
// They are a starting, explainable heuristic - the benchmark's purpose right
// now is to establish a baseline to evaluate against, not to be curve-fit.

export type EvidenceStrengthBand = "none" | "weak" | "moderate" | "strong";

export type EvidenceItemLike = {
  stance: "supports" | "contradicts" | "context" | "unknown";
  authorityScore: number;
  relevanceScore: number;
  stanceConfidence: number;
  independenceGroup: string;
  sourceType: SourceType;
};

export type EvidenceAssessment = {
  supportStrength: EvidenceStrengthBand;
  contradictionStrength: EvidenceStrengthBand;
  independentSupportingCount: number;
  independentContradictingCount: number;
  // Informational only - a rounded composite of authority x relevance x
  // stanceConfidence, averaged across the strongest item per independent
  // group. Not a verdict, not a percentage, not benchmark-tuned.
  supportWeight: number;
  contradictionWeight: number;
  explanation: string;
  isHeuristic: true;
};

// Items below this per-item weight are treated as noise for banding
// purposes (e.g. a low-authority, low-confidence, tangential "support") -
// they still exist in the underlying evidence, they just don't move the
// needle on strength.
const NOISE_FLOOR = 0.15;

function itemWeight(item: EvidenceItemLike): number {
  return item.authorityScore * item.relevanceScore * item.stanceConfidence;
}

function strongestWeightPerGroup(items: EvidenceItemLike[]): number[] {
  const bestByGroup = new Map<string, number>();
  for (const item of items) {
    const weight = itemWeight(item);
    if (weight < NOISE_FLOOR) continue;
    const current = bestByGroup.get(item.independenceGroup) ?? 0;
    if (weight > current) bestByGroup.set(item.independenceGroup, weight);
  }
  return Array.from(bestByGroup.values());
}

function bandForSide(groupWeights: number[]): { band: EvidenceStrengthBand; avgWeight: number } {
  if (groupWeights.length === 0) return { band: "none", avgWeight: 0 };

  const avgWeight = groupWeights.reduce((sum, w) => sum + w, 0) / groupWeights.length;
  const independentGroupCount = groupWeights.length;

  if (independentGroupCount >= 2 && avgWeight >= 0.6) {
    return { band: "strong", avgWeight };
  }
  if (
    (independentGroupCount >= 2 && avgWeight >= 0.35) ||
    (independentGroupCount === 1 && avgWeight >= 0.6)
  ) {
    return { band: "moderate", avgWeight };
  }
  return { band: "weak", avgWeight };
}

function describeBand(
  side: "support" | "contradiction",
  band: EvidenceStrengthBand,
  independentCount: number,
  avgWeight: number
): string {
  if (band === "none") {
    return side === "support"
      ? "No supporting evidence identified."
      : "No contradicting evidence identified.";
  }

  const sourcesLabel = `${independentCount} independent source${independentCount === 1 ? "" : "s"}`;
  const authorityLabel = avgWeight >= 0.6 ? "high-authority" : avgWeight >= 0.35 ? "moderate-authority" : "lower-authority";
  const verb = side === "support" ? "support" : "contradict";
  const bandLabel = band === "strong" ? "Strong" : band === "moderate" ? "Moderate" : "Weak";

  return `${bandLabel} ${side}: ${sourcesLabel} (${authorityLabel}) ${verb} the claim.`;
}

export function assessEvidenceStrength(items: EvidenceItemLike[]): EvidenceAssessment {
  const supporting = items.filter((item) => item.stance === "supports");
  const contradicting = items.filter((item) => item.stance === "contradicts");

  const supportGroupWeights = strongestWeightPerGroup(supporting);
  const contradictionGroupWeights = strongestWeightPerGroup(contradicting);

  const { band: supportStrength, avgWeight: supportWeight } = bandForSide(supportGroupWeights);
  const { band: contradictionStrength, avgWeight: contradictionWeight } = bandForSide(
    contradictionGroupWeights
  );

  const independentSupportingCount = supportGroupWeights.length;
  const independentContradictingCount = contradictionGroupWeights.length;

  const explanation = [
    describeBand("support", supportStrength, independentSupportingCount, supportWeight),
    describeBand("contradiction", contradictionStrength, independentContradictingCount, contradictionWeight),
  ].join(" ");

  return {
    supportStrength,
    contradictionStrength,
    independentSupportingCount,
    independentContradictingCount,
    supportWeight: Math.round(supportWeight * 100) / 100,
    contradictionWeight: Math.round(contradictionWeight * 100) / 100,
    explanation,
    isHeuristic: true,
  };
}

// Convenience re-export so callers don't need a second import just to count
// how many distinct independent groups appear among a stance-filtered list.
export { countDistinctGroups };
