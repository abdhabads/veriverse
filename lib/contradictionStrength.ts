import {
  assessEvidenceItemStrength,
  EvidenceStrengthInput,
  EvidenceItemStrength,
  ClaimTemporalJurisdictionContext,
} from "@/lib/evidenceStrength";

// A contradiction is not "supportCount > 0" or the presence of a negated
// word - it's a tiered judgment built on the same per-item dimensions as
// evidence strength (lib/evidenceStrength.ts), because "how strong is this
// contradiction" and "how strong is this support" are the same underlying
// question asked of evidence pointing the other way.

export type ContradictionTier = "direct" | "weak_indirect" | "no_contradiction";

export type ContradictionStrengthBand = "strong" | "moderate" | "weak" | "none";

// Below this temporalFit/jurisdictionFit value, evidence is treated as
// possibly not even addressing the same proposition as the claim - a
// CERTAIN mismatch (far-off year, different named jurisdiction), not mere
// uncertainty (which sits at 0.5/0.8 and stays above this threshold, since
// "we don't know" must never be read as "confirmed different").
const PROPOSITION_MISMATCH_THRESHOLD = 0.35;

// A contradicting item still needs reasonable stance confidence AND
// relevance to count as DIRECT - "the classifier said contradicts" alone
// (e.g. from a single ambiguous negated phrase) is exactly the "lexical
// negation as proof" the sprint says not to trust.
const DIRECT_CONFIDENCE_THRESHOLD = 0.6;
const DIRECT_RELEVANCE_THRESHOLD = 0.5;

export function classifyContradictionTier(
  item: EvidenceStrengthInput,
  strength: EvidenceItemStrength
): ContradictionTier {
  if (item.stance !== "contradicts") return "no_contradiction";

  const addressesSameProposition =
    strength.temporalFit >= PROPOSITION_MISMATCH_THRESHOLD &&
    strength.jurisdictionFit >= PROPOSITION_MISMATCH_THRESHOLD;
  if (!addressesSameProposition) return "no_contradiction";

  const isDirect =
    item.stanceConfidence >= DIRECT_CONFIDENCE_THRESHOLD &&
    strength.relevance >= DIRECT_RELEVANCE_THRESHOLD &&
    strength.authority > 0.05;

  return isDirect ? "direct" : "weak_indirect";
}

export type ClaimContradictionStrengthResult = {
  band: ContradictionStrengthBand;
  // Independent-group-deduped counts - 20 copies of the same contradicting
  // article count once, same mechanism as lib/evidenceStrength.ts.
  directCount: number;
  weakCount: number;
  confidence: number;
  reasons: string[];
};

const tierRank: Record<ContradictionTier, number> = {
  direct: 2,
  weak_indirect: 1,
  no_contradiction: 0,
};

export function assessClaimContradictionStrength(
  items: EvidenceStrengthInput[],
  claimContext: ClaimTemporalJurisdictionContext
): ClaimContradictionStrengthResult {
  const groupSizes = new Map<string, number>();
  for (const item of items) {
    groupSizes.set(item.independenceGroup, (groupSizes.get(item.independenceGroup) || 0) + 1);
  }

  const contradicting = items.filter((item) => item.stance === "contradicts");

  const bestByGroup = new Map<string, { tier: ContradictionTier; strength: EvidenceItemStrength }>();
  for (const item of contradicting) {
    const strength = assessEvidenceItemStrength(
      item,
      groupSizes.get(item.independenceGroup) || 1,
      claimContext
    );
    const tier = classifyContradictionTier(item, strength);
    if (tier === "no_contradiction") continue;

    const current = bestByGroup.get(item.independenceGroup);
    if (
      !current ||
      tierRank[tier] > tierRank[current.tier] ||
      (tierRank[tier] === tierRank[current.tier] && strength.score > current.strength.score)
    ) {
      bestByGroup.set(item.independenceGroup, { tier, strength });
    }
  }

  const entries = Array.from(bestByGroup.values());
  const directCount = entries.filter((entry) => entry.tier === "direct").length;
  const weakCount = entries.filter((entry) => entry.tier === "weak_indirect").length;

  let band: ContradictionStrengthBand = "none";
  if (directCount >= 2) band = "strong";
  else if (directCount === 1) band = "moderate";
  else if (weakCount > 0) band = "weak";

  const confidence =
    entries.length > 0
      ? entries.reduce((sum, entry) => sum + entry.strength.confidence, 0) / entries.length
      : contradicting.length > 0
      ? 0.5 // stance said "contradicts" but every instance was disqualified (wrong proposition/weak signal)
      : 0.3; // no contradicting evidence found at all - low confidence there's genuinely none, not a claim of consistency

  const reasons: string[] = [];
  if (directCount > 0) {
    reasons.push(`${directCount} independent direct contradiction(s) found.`);
  }
  if (weakCount > 0) {
    reasons.push(`${weakCount} weak/indirect tension signal(s) found (not treated as direct contradiction).`);
  }
  if (directCount === 0 && weakCount === 0) {
    reasons.push(
      contradicting.length > 0
        ? "Evidence classified as contradicting existed but did not meet the bar for a genuine contradiction (low confidence, low relevance, or a different proposition/time/jurisdiction)."
        : "No contradicting evidence found."
    );
  }

  return {
    band,
    directCount,
    weakCount,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}
