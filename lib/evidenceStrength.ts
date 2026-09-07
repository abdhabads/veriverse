import { SourceType } from "@/lib/sourceAuthority";
import { TemporalScope } from "@/lib/claimNormalization";
import { extractJurisdiction } from "@/lib/claimNormalization";

// Per-EVIDENCE-ITEM structured strength assessment - the granular layer
// Sprint 1's lib/evidenceScoring.ts didn't have (that file only ever
// produced a claim-level band from a flat authority*relevance*confidence
// product). This file is what Sprint 3's contradictionStrength.ts and
// verificationConfidence.ts are actually built on.
//
// Every dimension here is a labeled, bounded [0,1] heuristic - never
// presented as validated, never silently summed away. `confidence` on the
// returned object is NOT the same thing as `score`: `score` says how strong
// this piece of evidence is, `confidence` says how sure we are that `score`
// is even meaningful (e.g. we have no publish date, so temporal fit is a
// guess, not a measurement).

export type EvidenceStrengthBand = "strong" | "moderate" | "weak" | "negligible";

export type EvidenceStrengthInput = {
  stance: "supports" | "contradicts" | "context" | "unknown";
  authorityScore: number;
  relevanceScore: number;
  stanceConfidence: number;
  independenceGroup: string;
  sourceType: SourceType;
  publishedAt: Date | null;
  evidenceText: string | null;
};

export type ClaimTemporalJurisdictionContext = {
  temporalScope: TemporalScope;
  jurisdiction: string | null;
};

export type EvidenceItemStrength = {
  score: number;
  band: EvidenceStrengthBand;
  authority: number;
  independence: number;
  relevance: number;
  directness: number;
  temporalFit: number;
  jurisdictionFit: number;
  confidence: number;
  reasons: string[];
};

function directnessFor(stance: EvidenceStrengthInput["stance"], stanceConfidence: number): number {
  if (stance === "supports" || stance === "contradicts") {
    // These stances mean "directly addresses the claim as stated" by
    // definition (see lib/groundedFactCheck.ts's prompt) - directness here
    // reflects how sure we are the classifier got that right, not whether
    // it's direct at all.
    return 0.5 + 0.5 * stanceConfidence;
  }
  if (stance === "context") return 0.3; // explicitly not a direct address by definition
  return 0.1; // unknown
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function temporalFitFor(
  publishedAt: Date | null,
  temporalScope: TemporalScope
): { fit: number; certain: boolean; reason: string } {
  if (temporalScope.type !== "specific") {
    // No stated target period - fall back to general freshness relative to
    // now, since a decade-old article about an evergreen-sounding claim is
    // still objectively less useful than a recent one.
    if (!publishedAt) {
      return { fit: 0.5, certain: false, reason: "No publish date; claim has no stated period either - temporal fit is a guess." };
    }
    const ageMs = Date.now() - publishedAt.getTime();
    if (ageMs < ONE_YEAR_MS) return { fit: 1, certain: true, reason: "Published within the last year." };
    if (ageMs < 3 * ONE_YEAR_MS) return { fit: 0.7, certain: true, reason: "Published 1-3 years ago." };
    return { fit: 0.4, certain: true, reason: "Published more than 3 years ago." };
  }

  if (!publishedAt) {
    return { fit: 0.5, certain: false, reason: "Claim states a specific period but this source has no publish date." };
  }

  const targetYear = Number((temporalScope.value || "").slice(0, 4));
  const publishedYear = publishedAt.getFullYear();
  if (!Number.isFinite(targetYear)) {
    return { fit: 0.5, certain: false, reason: "Claim's stated period could not be parsed." };
  }
  const diff = Math.abs(publishedYear - targetYear);
  if (diff === 0) return { fit: 1, certain: true, reason: "Published in the claim's stated period." };
  if (diff === 1) return { fit: 0.7, certain: true, reason: "Published within a year of the claim's stated period." };
  return { fit: 0.3, certain: true, reason: `Published ${diff} years from the claim's stated period.` };
}

function jurisdictionFitFor(
  evidenceText: string | null,
  claimJurisdiction: string | null
): { fit: number; certain: boolean; reason: string } {
  if (!claimJurisdiction) {
    return { fit: 0.8, certain: false, reason: "Claim states no specific jurisdiction - not penalized." };
  }
  const evidenceJurisdiction = evidenceText ? extractJurisdiction(evidenceText) : null;
  if (!evidenceJurisdiction) {
    return { fit: 0.5, certain: false, reason: "This source's jurisdiction could not be determined." };
  }
  return evidenceJurisdiction === claimJurisdiction
    ? { fit: 1, certain: true, reason: "Matches the claim's jurisdiction." }
    : { fit: 0.1, certain: true, reason: "States a different jurisdiction than the claim." };
}

function bandFor(score: number): EvidenceStrengthBand {
  if (score >= 0.5) return "strong";
  if (score >= 0.25) return "moderate";
  if (score > 0.05) return "weak";
  return "negligible";
}

// siblingGroupCount: how many evidence items (across the whole batch this
// item was retrieved with) share this item's independenceGroup, including
// itself. 1 = uniquely independent. This is the per-item mechanism behind
// Phase 13's "20 copies of the same article" resistance: each of the 20
// gets independence = 1/20, so no single duplicated item can score "strong"
// on its own, and (see contradictionStrength.ts/verificationConfidence.ts)
// aggregation counts independent GROUPS, not raw items, on top of this.
export function assessEvidenceItemStrength(
  item: EvidenceStrengthInput,
  siblingGroupCount: number,
  claimContext: ClaimTemporalJurisdictionContext
): EvidenceItemStrength {
  const reasons: string[] = [];

  const authority = Math.max(0, Math.min(1, item.authorityScore));
  reasons.push(`Source authority: ${authority.toFixed(2)} (${item.sourceType}).`);

  const independence = 1 / Math.max(1, siblingGroupCount);
  if (siblingGroupCount > 1) {
    reasons.push(`Shares an independence group with ${siblingGroupCount - 1} other item(s) - independence discounted to ${independence.toFixed(2)}.`);
  } else {
    reasons.push("No detected duplicates - independence not discounted.");
  }

  const relevance = Math.max(0, Math.min(1, item.relevanceScore));

  const directness = directnessFor(item.stance, item.stanceConfidence);
  reasons.push(`Stance "${item.stance}" (directness ${directness.toFixed(2)}).`);

  const temporal = temporalFitFor(item.publishedAt, claimContext.temporalScope);
  reasons.push(temporal.reason);

  const jurisdiction = jurisdictionFitFor(item.evidenceText, claimContext.jurisdiction);
  reasons.push(jurisdiction.reason);

  if (!item.evidenceText) {
    reasons.push("No verifiable evidence text/span attached - completeness is low.");
  }

  const score =
    authority * independence * relevance * directness * temporal.fit * jurisdiction.fit;

  let confidence = 1;
  if (!temporal.certain) confidence -= 0.15;
  if (!jurisdiction.certain) confidence -= 0.15;
  if (!item.evidenceText) confidence -= 0.2;
  if (item.stance === "unknown") confidence -= 0.1;
  confidence = Math.max(0.1, Math.round(confidence * 100) / 100);

  return {
    score: Math.round(score * 1000) / 1000,
    band: bandFor(score),
    authority,
    independence: Math.round(independence * 100) / 100,
    relevance,
    directness: Math.round(directness * 100) / 100,
    temporalFit: temporal.fit,
    jurisdictionFit: jurisdiction.fit,
    confidence,
    reasons,
  };
}

export type ClaimEvidenceStrengthResult = {
  score: number;
  band: EvidenceStrengthBand;
  confidence: number;
  independentSupportingCount: number;
  reasons: string[];
};

// Claim-level aggregate of the SUPPORTING side only - contradiction is a
// separate dimension (lib/contradictionStrength.ts), not folded in here, per
// the sprint's explicit separation of the two. "context"/"unknown" stance
// items don't feed into either strength dimension - they surface as
// unresolvedEvidenceIds on the TrustAssessment instead.
//
// Resists the "20 copies of the same article" attack two ways: duplicates
// share an independenceGroup (so each individually scores low via the
// per-item independence discount above), AND only the single best-scoring
// item per group is counted at all, so 20 copies contribute exactly like 1.
// A "strong" band additionally requires >= 2 independent groups, mirroring
// lib/evidenceScoring.ts's Sprint 1 rule - one source, however authoritative,
// caps at "moderate" until corroborated.
export function assessClaimEvidenceStrength(
  items: EvidenceStrengthInput[],
  claimContext: ClaimTemporalJurisdictionContext
): ClaimEvidenceStrengthResult {
  const groupSizes = new Map<string, number>();
  for (const item of items) {
    groupSizes.set(item.independenceGroup, (groupSizes.get(item.independenceGroup) || 0) + 1);
  }

  const supporting = items.filter((item) => item.stance === "supports");
  const bestByGroup = new Map<string, EvidenceItemStrength>();
  for (const item of supporting) {
    const strength = assessEvidenceItemStrength(
      item,
      groupSizes.get(item.independenceGroup) || 1,
      claimContext
    );
    const current = bestByGroup.get(item.independenceGroup);
    if (!current || strength.score > current.score) {
      bestByGroup.set(item.independenceGroup, strength);
    }
  }

  const meaningful = Array.from(bestByGroup.values()).filter((s) => s.band !== "negligible");

  if (meaningful.length === 0) {
    return {
      score: 0,
      band: "negligible",
      confidence: supporting.length > 0 ? 0.5 : 0.3,
      independentSupportingCount: 0,
      reasons: [
        supporting.length > 0
          ? "Supporting evidence exists but none meets the minimum strength threshold."
          : "No supporting evidence found.",
      ],
    };
  }

  const avgScore = meaningful.reduce((sum, s) => sum + s.score, 0) / meaningful.length;
  const avgConfidence = meaningful.reduce((sum, s) => sum + s.confidence, 0) / meaningful.length;
  let band = bandFor(avgScore);
  if (band === "strong" && meaningful.length < 2) {
    band = "moderate"; // one source, however strong, is not yet corroborated
  }

  return {
    score: Math.round(avgScore * 1000) / 1000,
    band,
    confidence: Math.round(avgConfidence * 100) / 100,
    independentSupportingCount: meaningful.length,
    reasons: [
      `${meaningful.length} independent supporting source group(s), average strength ${avgScore.toFixed(2)}.`,
    ],
  };
}
