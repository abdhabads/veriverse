// Sprint 6.75 — Evidence Conflict & Contestation Model.
//
// A pure, experimental, NOT-PRODUCTION-WIRED model for how VeriVerse
// should represent "credible evidence exists on both sides of a
// proposition" - built after Sprint 6.5 found that the current production
// logic (lib/evidenceStrength.ts + lib/contradictionStrength.ts +
// lib/trustAssessment.ts's determineAssessmentBand) can let a single
// strong contradiction override substantial (if individually modest)
// independent support, producing a confident, wrong "contradicted"
// verdict. That finding is a MISSING CONTESTATION STATE, not merely a
// miscalibrated number - the existing 5-band AssessmentBand has no way to
// say "both sides have real evidence; the honest answer is conflict, not
// a verdict for either side." This file explores what a model with that
// missing state would need to look like, and deliberately keeps the two
// sides' evidence profiles separately inspectable rather than collapsing
// them into one scalar prematurely (see lib/evidenceConflictCandidates.ts
// for where classifier logic that DOES compare the two sides lives -
// nothing in file classifies anything, it only describes each side).
//
// Nothing here is called by any production code path. This file does not
// modify lib/evidenceStrength.ts, lib/contradictionStrength.ts, or
// lib/trustAssessment.ts.

import { assessEvidenceItemStrength, EvidenceStrengthInput, EvidenceItemStrength } from "@/lib/evidenceStrength";
import { TemporalScope } from "@/lib/claimNormalization";

// ---------------------------------------------------------------------------
// Taxonomy (Phase 1) - the 10 requested categories, each with the concrete
// structural signal that identifies it. Priority order matters: earlier
// categories are checked first in classifyConflictCategory
// (lib/evidenceConflictCandidates.ts) because they describe structural
// facts about the evidence (does it even address the same proposition?)
// that should be resolved BEFORE asking a quality-comparison question.
// ---------------------------------------------------------------------------

export type ConflictCategory =
  | "unopposed_support" // only supporting evidence exists
  | "unopposed_contradiction" // only contradicting evidence exists
  | "weak_opposition" // one side clearly outclasses the other in quality/corroboration
  | "strong_opposition" // one side outclasses the other, but the weaker side is still real (not negligible)
  | "balanced_conflict" // both sides reach a comparable quality tier
  | "asymmetric_conflict" // one side has broad independent corroboration, the other a single strong item - neither cleanly "beats" the other
  | "source_quality_conflict" // similar evidence QUANTITY on both sides, but a large authority/directness gap
  | "temporal_conflict" // the two sides' best evidence addresses materially different time periods
  | "jurisdictional_conflict" // the two sides' best evidence addresses different jurisdictions
  | "evidence_supersession" // one side's evidence is both more recent AND addresses the claim's current state - the older evidence is superseded, not "contradicted"
  | "insufficient_both"; // neither side has meaningful evidence at all

// ---------------------------------------------------------------------------
// Sided evidence profile (Phase 2) - built independently for the
// supporting side and the contradicting side. Deliberately NOT a single
// number: keeps the best single item's full dimensional breakdown
// alongside corroboration count, so a resolution strategy can ask
// "how strong is the single best piece of evidence" and "how much
// independent corroboration exists" as two separate questions, per the
// review's own PM-resignation example (one authoritative direct denial
// should be able to outweigh many low-quality claims - a pure count or a
// pure average would get this wrong in one direction or the other).
// ---------------------------------------------------------------------------

export type EvidenceQualityTier =
  | "none" // no items on this side at all
  | "weak_uncorroborated" // items exist but are individually weak AND not meaningfully corroborated
  | "weak_corroborated" // individually weak, but corroborated by several independent sources
  | "moderate" // a single item reaches the existing "moderate" per-item band, OR overwhelming independent corroboration
  | "authoritative_direct"; // a single item is unambiguously strong, authoritative, direct, and on-topic

export type SidedEvidenceProfile = {
  itemCount: number;
  // Only items whose per-item score clears the existing item-level
  // "negligible" floor (0.05) count toward independent-group corroboration -
  // otherwise an unlimited pile of truly negligible items could rescue
  // itself into "weak_corroborated" purely by volume, exactly the
  // source-counting failure mode this whole line of work exists to resist.
  meaningfulIndependentGroupCount: number;
  bestItem: EvidenceItemStrength | null;
  // Retained alongside bestItem specifically for temporal-supersession
  // comparison (lib/evidenceConflictCandidates.ts) - EvidenceItemStrength
  // itself only carries the DERIVED temporalFit score, not the underlying
  // publish date needed to tell "addresses an older period" apart from
  // "addresses the same period, just less precisely."
  bestItemPublishedAt: Date | null;
  avgMeaningfulScore: number; // informational only - NOT used to decide quality tier, see header
  qualityTier: EvidenceQualityTier;
};

const QUALITY_TIER_RANK: Record<EvidenceQualityTier, number> = {
  none: 0,
  weak_uncorroborated: 1,
  weak_corroborated: 2,
  moderate: 3,
  authoritative_direct: 4,
};

export function qualityTierRank(tier: EvidenceQualityTier): number {
  return QUALITY_TIER_RANK[tier];
}

// Thresholds are explicit, named constants, chosen by inspection of the
// existing per-item bandFor() cutoffs (0.05/0.25/0.5) and Sprint 6.5's
// finding that overwhelming (8+) independent corroboration should count
// for something even without one standout item - NOT tuned against any
// specific benchmark case, per the standing "no tuning against individual
// examples" rule. These are stated as a starting hypothesis to be
// measured against the adversarial matrix, not asserted as correct.
const AUTHORITATIVE_DIRECT_MIN_SCORE = 0.5;
const AUTHORITATIVE_DIRECT_MIN_AUTHORITY = 0.7;
const AUTHORITATIVE_DIRECT_MIN_DIRECTNESS = 0.7;
const AUTHORITATIVE_DIRECT_MIN_RELEVANCE = 0.6;
const MODERATE_MIN_SCORE = 0.25;
const MODERATE_MIN_CORROBORATION_GROUPS = 8;
const WEAK_CORROBORATED_MIN_GROUPS = 3;

function classifyQualityTier(bestItem: EvidenceItemStrength | null, meaningfulIndependentGroupCount: number): EvidenceQualityTier {
  if (!bestItem) return "none";
  if (
    bestItem.score >= AUTHORITATIVE_DIRECT_MIN_SCORE &&
    bestItem.authority >= AUTHORITATIVE_DIRECT_MIN_AUTHORITY &&
    bestItem.directness >= AUTHORITATIVE_DIRECT_MIN_DIRECTNESS &&
    bestItem.relevance >= AUTHORITATIVE_DIRECT_MIN_RELEVANCE
  ) {
    return "authoritative_direct";
  }
  if (bestItem.score >= MODERATE_MIN_SCORE || meaningfulIndependentGroupCount >= MODERATE_MIN_CORROBORATION_GROUPS) {
    return "moderate";
  }
  if (meaningfulIndependentGroupCount >= WEAK_CORROBORATED_MIN_GROUPS) {
    return "weak_corroborated";
  }
  return "weak_uncorroborated";
}

// Builds a profile for ONE side (already filtered to that side's stance by
// the caller - see lib/evidenceConflictCandidates.ts's buildEvidenceState).
// Reuses assessEvidenceItemStrength (lib/evidenceStrength.ts) unmodified -
// per-item scoring itself is not in question here, only how the two
// sides' resulting items get compared.
export function buildSidedProfile(
  items: EvidenceStrengthInput[],
  claimContext: { temporalScope: TemporalScope; jurisdiction: string | null }
): SidedEvidenceProfile {
  const groupSizes = new Map<string, number>();
  for (const item of items) groupSizes.set(item.independenceGroup, (groupSizes.get(item.independenceGroup) || 0) + 1);

  const bestByGroup = new Map<string, { strength: EvidenceItemStrength; publishedAt: Date | null }>();
  for (const item of items) {
    const strength = assessEvidenceItemStrength(item, groupSizes.get(item.independenceGroup) || 1, claimContext);
    const current = bestByGroup.get(item.independenceGroup);
    if (!current || strength.score > current.strength.score) {
      bestByGroup.set(item.independenceGroup, { strength, publishedAt: item.publishedAt });
    }
  }

  const meaningful = Array.from(bestByGroup.values()).filter((s) => s.strength.score > 0.05);
  const best = meaningful.reduce<{ strength: EvidenceItemStrength; publishedAt: Date | null } | null>(
    (best, s) => (!best || s.strength.score > best.strength.score ? s : best),
    null
  );
  const avgMeaningfulScore =
    meaningful.length > 0 ? meaningful.reduce((sum, s) => sum + s.strength.score, 0) / meaningful.length : 0;

  return {
    itemCount: items.length,
    meaningfulIndependentGroupCount: meaningful.length,
    bestItem: best?.strength ?? null,
    bestItemPublishedAt: best?.publishedAt ?? null,
    avgMeaningfulScore: Math.round(avgMeaningfulScore * 1000) / 1000,
    qualityTier: classifyQualityTier(best?.strength ?? null, meaningful.length),
  };
}

// ---------------------------------------------------------------------------
// Candidate internal evidence states (Phase 3) - finer resolution than the
// existing 5-band AssessmentBand, specifically to distinguish "there is a
// credible opposing source" from "the evidence establishes this claim is
// false." Mapping to the existing bands lives in
// lib/evidenceConflictCandidates.ts (mapEvidenceStateToAssessmentBand),
// kept separate from this type definition so the mapping choice is visibly
// a separate decision from the taxonomy itself.
// ---------------------------------------------------------------------------

export type EvidenceState =
  | "well_supported"
  | "supported_but_contested"
  | "conflicting_evidence"
  | "weakly_supported"
  | "insufficient_evidence"
  | "weakly_contradicted"
  | "contradicted"
  | "strongly_contradicted";
