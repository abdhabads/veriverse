// Sprint 6.75: conflict-category classification and candidate resolution
// STRATEGIES built on lib/evidenceConflictModel.ts's SidedEvidenceProfile.
// Three candidates are compared, one of them deliberately bad:
//
//   - NAIVE_MAJORITY: raw item-count comparison. Included ONLY as the
//     cautionary baseline the review explicitly warned against adopting -
//     "do not assume majority vote is epistemically correct." Its results
//     are reported specifically to show why it's wrong, not as a real
//     candidate.
//   - QUALITY_DIFFERENTIAL: a continuous score comparison (best item's
//     score plus a capped corroboration bonus), requiring a minimum margin
//     before declaring either side the winner.
//   - TIERED_DOMINANCE: a categorical comparison using
//     EvidenceQualityTier rank, requiring a rank gap of >= 3 (out of a
//     0-4 scale) before declaring either side the winner outright - a
//     smaller gap resolves to a conflict state instead of a verdict.
//
// None of these are applied to production code. This file is pure and
// synchronous throughout - no DB or API access.

import { EvidenceStrengthInput } from "@/lib/evidenceStrength";
import { TemporalScope } from "@/lib/claimNormalization";
import {
  SidedEvidenceProfile,
  buildSidedProfile,
  ConflictCategory,
  EvidenceState,
  qualityTierRank,
} from "@/lib/evidenceConflictModel";

// Added during Shadow Mode Implementation, per contract §6's exact
// pre-specification - mirrors TRUST_ASSESSMENT_MODEL_VERSION
// (lib/trustAssessment.ts) and PROPOSITION_SCHEMA_VERSION
// (lib/propositionExtraction.ts): bump whenever the resolution logic in
// this file changes meaningfully. Stamped on every ShadowAssessment record
// (models/ShadowAssessment.ts) so a model-version change never silently
// reinterprets old records.
export const SHADOW_MODEL_VERSION = "shadow-conflict-model-v1";

export type ClaimContext = { temporalScope: TemporalScope; jurisdiction: string | null };

export type EvidenceConflictInput = {
  supportProfile: SidedEvidenceProfile;
  contradictionProfile: SidedEvidenceProfile;
};

export function buildEvidenceConflictInput(
  items: EvidenceStrengthInput[],
  claimContext: ClaimContext
): EvidenceConflictInput {
  const supporting = items.filter((i) => i.stance === "supports");
  const contradicting = items.filter((i) => i.stance === "contradicts");
  return {
    supportProfile: buildSidedProfile(supporting, claimContext),
    contradictionProfile: buildSidedProfile(contradicting, claimContext),
  };
}

// ---------------------------------------------------------------------------
// Structural checks (temporal / jurisdictional conflict, supersession) -
// checked BEFORE any quality-tier comparison, since these are questions of
// "do the two sides even address the same proposition," not "which side
// is stronger." A large publish-date gap combined with a specific claim
// period is read as supersession (the more recent side describes the
// claim's current state) rather than an unresolved contradiction.
// ---------------------------------------------------------------------------

const SUPERSESSION_MIN_GAP_YEARS = 3;

function yearsBetween(a: Date, b: Date): number {
  return Math.abs(a.getFullYear() - b.getFullYear());
}

function detectStructuralCategory(
  support: SidedEvidenceProfile,
  contradiction: SidedEvidenceProfile,
  claimContext: ClaimContext
): ConflictCategory | null {
  if (!support.bestItem || !contradiction.bestItem) return null; // nothing to structurally compare

  // Jurisdictional conflict: both sides address a claim jurisdiction is
  // stated for, but each side's best item's jurisdictionFit suggests a
  // DIFFERENT jurisdiction than the other (both far from 1, in a way that
  // isn't just "uncertain" - jurisdictionFitFor returns 0.1 specifically
  // for a certain mismatch, 0.5 for genuine uncertainty).
  if (claimContext.jurisdiction && support.bestItem.jurisdictionFit <= 0.15 && contradiction.bestItem.jurisdictionFit >= 0.9) {
    return "jurisdictional_conflict";
  }
  if (claimContext.jurisdiction && contradiction.bestItem.jurisdictionFit <= 0.15 && support.bestItem.jurisdictionFit >= 0.9) {
    return "jurisdictional_conflict";
  }

  // Temporal: only meaningful when both sides have a real publish date to
  // compare and the claim has a specific stated period.
  if (claimContext.temporalScope.type === "specific" && support.bestItemPublishedAt && contradiction.bestItemPublishedAt) {
    const gap = yearsBetween(support.bestItemPublishedAt, contradiction.bestItemPublishedAt);
    if (gap >= SUPERSESSION_MIN_GAP_YEARS) {
      // Supersession requires knowing the claim's OWN period too - the
      // side whose publish date is closer to the claim's stated period is
      // the one describing its current state; the other is superseded,
      // not a genuine ongoing contradiction.
      const targetYear = Number((claimContext.temporalScope.value || "").slice(0, 4));
      if (Number.isFinite(targetYear)) {
        return "evidence_supersession";
      }
      return "temporal_conflict";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Full taxonomy classification (Phase 1) - structural checks first, then
// quality-tier-based categories.
// ---------------------------------------------------------------------------

export function classifyConflictCategory(
  support: SidedEvidenceProfile,
  contradiction: SidedEvidenceProfile,
  claimContext: ClaimContext
): ConflictCategory {
  if (support.qualityTier === "none" && contradiction.qualityTier === "none") return "insufficient_both";
  if (contradiction.qualityTier === "none") return "unopposed_support";
  if (support.qualityTier === "none") return "unopposed_contradiction";

  const structural = detectStructuralCategory(support, contradiction, claimContext);
  if (structural) return structural;

  const rankGap = qualityTierRank(support.qualityTier) - qualityTierRank(contradiction.qualityTier);

  // Source-quality conflict: similar QUANTITY (item count within a factor
  // of 2) but a large quality-tier gap - the interesting case is not "one
  // side has more evidence," it's "one side's evidence is much better
  // despite similar volume."
  const countRatio =
    Math.max(support.itemCount, contradiction.itemCount) / Math.max(1, Math.min(support.itemCount, contradiction.itemCount));
  if (countRatio <= 2 && Math.abs(rankGap) >= 2) return "source_quality_conflict";

  if (Math.abs(rankGap) === 0) return "balanced_conflict";

  // Asymmetric conflict: one side has broad independent corroboration
  // (weak_corroborated or better via count) facing a single-item-driven
  // opposing tier - the Sprint 6.5 dangerous-transition shape specifically.
  const supportIsCorroborationDriven = support.meaningfulIndependentGroupCount >= 3 && support.itemCount > contradiction.itemCount * 2;
  const contradictionIsCorroborationDriven =
    contradiction.meaningfulIndependentGroupCount >= 3 && contradiction.itemCount > support.itemCount * 2;
  if (supportIsCorroborationDriven || contradictionIsCorroborationDriven) return "asymmetric_conflict";

  if (Math.abs(rankGap) === 1) return "weak_opposition";
  return "strong_opposition";
}

// ---------------------------------------------------------------------------
// Candidate A: naive majority - explicitly the wrong approach, kept only
// for comparison. Never returns a "conflict" state at all, which is
// exactly its flaw.
// ---------------------------------------------------------------------------

export function resolveNaiveMajority(support: SidedEvidenceProfile, contradiction: SidedEvidenceProfile): EvidenceState {
  if (support.itemCount === 0 && contradiction.itemCount === 0) return "insufficient_evidence";
  if (support.itemCount > contradiction.itemCount) return "well_supported";
  if (contradiction.itemCount > support.itemCount) return "contradicted";
  return "conflicting_evidence";
}

// ---------------------------------------------------------------------------
// Candidate B: quality-adjusted differential. A continuous score per side
// (best item's score + a capped, diminishing corroboration bonus),
// compared with a required margin before declaring a winner.
// ---------------------------------------------------------------------------

const CORROBORATION_BONUS_PER_GROUP = 0.04;
const CORROBORATION_BONUS_CAP_GROUPS = 6; // diminishing returns past this many groups
const QUALITY_DIFFERENTIAL_MARGIN = 0.15; // required gap before declaring a winner, not a conflict

function sideStrength(profile: SidedEvidenceProfile): number {
  if (!profile.bestItem) return 0;
  const bonus = CORROBORATION_BONUS_PER_GROUP * Math.min(profile.meaningfulIndependentGroupCount - 1, CORROBORATION_BONUS_CAP_GROUPS - 1);
  return profile.bestItem.score + Math.max(0, bonus);
}

export function resolveQualityDifferential(support: SidedEvidenceProfile, contradiction: SidedEvidenceProfile): EvidenceState {
  const supportStrength = sideStrength(support);
  const contradictionStrength = sideStrength(contradiction);

  if (supportStrength === 0 && contradictionStrength === 0) return "insufficient_evidence";
  if (contradictionStrength === 0) return support.qualityTier === "authoritative_direct" ? "well_supported" : "weakly_supported";
  if (supportStrength === 0) return contradiction.qualityTier === "authoritative_direct" ? "strongly_contradicted" : "weakly_contradicted";

  const diff = supportStrength - contradictionStrength;
  if (Math.abs(diff) < QUALITY_DIFFERENTIAL_MARGIN) return "conflicting_evidence";

  if (diff > 0) {
    return diff >= QUALITY_DIFFERENTIAL_MARGIN * 2 && support.qualityTier === "authoritative_direct"
      ? "well_supported"
      : "supported_but_contested";
  }
  return -diff >= QUALITY_DIFFERENTIAL_MARGIN * 2 && contradiction.qualityTier === "authoritative_direct"
    ? "strongly_contradicted"
    : "weakly_contradicted";
}

// ---------------------------------------------------------------------------
// Candidate C: tiered dominance. Categorical (EvidenceQualityTier rank)
// comparison. A rank gap of 1-2 resolves to a conflict/contested state
// (this is the gap the Sprint 6.5 dangerous case sits at: weak_corroborated
// vs authoritative_direct, rank 2 vs 4, gap 2); only a gap of >= 3 is
// enough to declare a side the outright winner (e.g. none/weak_uncorroborated
// vs authoritative_direct - the PM-resignation shape, where the "10
// articles" side must itself be genuinely low-quality, not just smaller,
// to lose outright).
// ---------------------------------------------------------------------------

const OUTRIGHT_WIN_MIN_RANK_GAP = 3;

export function resolveTieredDominance(support: SidedEvidenceProfile, contradiction: SidedEvidenceProfile): EvidenceState {
  const supportRank = qualityTierRank(support.qualityTier);
  const contradictionRank = qualityTierRank(contradiction.qualityTier);

  if (supportRank === 0 && contradictionRank === 0) return "insufficient_evidence";
  // Support only has 2 "pure" severity levels in the requested taxonomy
  // (well_supported / weakly_supported); contradiction has 3
  // (strongly_contradicted / contradicted / weakly_contradicted) - the
  // taxonomy itself is asymmetric here, not a simplification made by this
  // candidate, so the unopposed-contradiction branch uses all 3 tiers
  // where the unopposed-support branch uses its available 2.
  if (contradictionRank === 0) return supportRank >= 3 ? "well_supported" : "weakly_supported";
  if (supportRank === 0) {
    if (contradiction.qualityTier === "authoritative_direct") return "strongly_contradicted";
    if (contradictionRank === 3) return "contradicted";
    return "weakly_contradicted";
  }

  const gap = supportRank - contradictionRank;
  if (Math.abs(gap) >= OUTRIGHT_WIN_MIN_RANK_GAP) {
    if (gap > 0) return support.qualityTier === "authoritative_direct" ? "well_supported" : "supported_but_contested";
    if (contradiction.qualityTier === "authoritative_direct") return "strongly_contradicted";
    if (contradictionRank === 3) return "contradicted";
    return "weakly_contradicted";
  }

  // Gap of 1 or 2, or a tie: real evidence exists on both sides at
  // comparable-enough quality that neither should be declared a winner.
  // Distinguish which side is at least favored, without asserting a verdict.
  if (gap >= 2) return "supported_but_contested";
  if (gap <= -2) return "weakly_contradicted";
  return "conflicting_evidence";
}

export function mapEvidenceStateToAssessmentBand(
  state: EvidenceState
): "well_supported" | "weakly_supported" | "contested" | "contradicted" | "insufficient_evidence" {
  switch (state) {
    case "well_supported":
      return "well_supported";
    case "supported_but_contested":
    case "conflicting_evidence":
    case "weakly_contradicted":
      return "contested";
    case "weakly_supported":
      return "weakly_supported";
    case "insufficient_evidence":
      return "insufficient_evidence";
    case "contradicted":
    case "strongly_contradicted":
      return "contradicted";
  }
}
