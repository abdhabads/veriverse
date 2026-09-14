// lib/claimPresentation.ts
//
// Presentation-only helpers for the Claim product entity (P3.1). These
// functions compute NOTHING about trust - they map already-computed,
// already-authoritative values (TrustAssessment.assessmentBand, evidence
// counts already selected by the API route) onto consumer-facing display
// metadata. No thresholds, no scoring, no evidence inspection.
//
// assessmentBand uses a different vocabulary from Post.status
// (well_supported/weakly_supported/contested/contradicted/
// insufficient_evidence vs. unverified/verified/disputed/false/flagged/
// under_expert_review/under_appeal_review) - see models/TrustAssessment.ts's
// own comment that assessmentBand is "a structured DESCRIPTIVE label, not a
// truth verdict". getTrustVerdict() (lib/trustPresentation.ts) was built for
// the Post vocabulary and must not be fed a Claim assessment. This file is
// the deliberate, honest adapter for the other vocabulary - reusing the same
// tone/icon system (TrustTone, TrustIconName) so it looks and feels
// consistent with the existing verdict pill, without pretending the two
// vocabularies are the same thing.
import type { TrustIconName } from "@/components/TrustIcons";
import type { TrustTone } from "@/lib/trustPresentation";

export type TrustAssessmentBand =
  | "well_supported"
  | "weakly_supported"
  | "contested"
  | "contradicted"
  | "insufficient_evidence";

export type ClaimVerdictPresentation = {
  label: string;
  tone: TrustTone;
  icon: TrustIconName;
};

const ASSESSMENT_BAND_PRESENTATION: Record<TrustAssessmentBand, ClaimVerdictPresentation> = {
  well_supported: { label: "Well Supported", tone: "positive", icon: "check" },
  weakly_supported: { label: "Weakly Supported", tone: "review", icon: "alert" },
  contested: { label: "Contested", tone: "review", icon: "alert" },
  contradicted: { label: "Contradicted", tone: "negative", icon: "x" },
  insufficient_evidence: { label: "Insufficient Evidence", tone: "neutral", icon: "circle" },
};

// Unknown/malformed band values fall back to the most conservative
// presentation ("Insufficient Evidence") rather than throwing or guessing a
// more confident-sounding tone.
export function getClaimAssessmentPresentation(assessmentBand: string): ClaimVerdictPresentation {
  return (
    ASSESSMENT_BAND_PRESENTATION[assessmentBand as TrustAssessmentBand] ??
    ASSESSMENT_BAND_PRESENTATION.insufficient_evidence
  );
}

// --- Plain-language summary ---
//
// Deterministic and templated only - derives from the already-computed
// assessmentBand plus public evidence counts. Never touches
// TrustAssessment.assessmentReasons/evidenceStrength.reasons/
// contradictionStrength.reasons (internal, not guaranteed user-safe
// wording - see the P3.1 field classification).
export type ClaimEvidenceCounts = {
  supportingCount: number;
  contradictingCount: number;
  contextCount: number;
};

export function getClaimSummarySentence(
  assessmentBand: string,
  counts: ClaimEvidenceCounts
): string {
  const { supportingCount, contradictingCount, contextCount } = counts;
  const parts: string[] = [];
  if (supportingCount > 0) {
    parts.push(`${supportingCount} supporting source${supportingCount === 1 ? "" : "s"}`);
  }
  if (contradictingCount > 0) {
    parts.push(`${contradictingCount} contradicting source${contradictingCount === 1 ? "" : "s"}`);
  }
  const countsClause = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  switch (assessmentBand as TrustAssessmentBand) {
    case "well_supported":
      return `Available evidence currently provides strong support for this claim${countsClause}.`;
    case "weakly_supported":
      return `Available evidence currently offers limited support for this claim${countsClause}.`;
    case "contested":
      return `Available evidence is currently mixed, with both supporting and contradicting sources${countsClause}.`;
    case "contradicted":
      return `Available evidence currently contradicts this claim${countsClause}.`;
    case "insufficient_evidence":
    default:
      return contextCount > 0
        ? "There is currently not enough evidence to assess this claim with confidence, though related context has been found."
        : "There is currently not enough evidence to assess this claim with confidence.";
  }
}

// --- Assessment explanation ("Why this assessment") ---
//
// P4.1: deliberately does NOT read TrustAssessment.assessmentReasons,
// evidenceStrength.reasons, contradictionStrength.reasons, or
// verificationConfidence.reasons at all - those arrays mix genuinely safe
// statements with internal jargon ("grounding status"), raw heuristic scores
// ("average strength 0.42"), and conceptually redundant restatements of the
// same underlying fact across producers (see the P4.0 audit). Instead this
// builds a fresh explanation from only the small set of already-typed,
// already-stored numeric/enum fields every TrustAssessment carries -
// assessmentBand, independentSupportingCount, directCount, weakCount, and
// confidenceLevel - so every sentence here is traceable to one specific
// stored field, and deduplication/no-raw-scores are structural guarantees
// of the construction rather than filtering rules applied after the fact.
export type ClaimExplanationReasonType = "support" | "contradiction" | "evidence" | "uncertainty";

export type ClaimExplanationReason = {
  type: ClaimExplanationReasonType;
  text: string;
};

export type ClaimExplanation = {
  summary: string;
  reasons: ClaimExplanationReason[];
};

export type ClaimExplanationInput = {
  assessmentBand: string;
  independentSupportingCount: number;
  directContradictionCount: number;
  weakContradictionCount: number;
  confidenceLevel: string;
};

const ASSESSMENT_BAND_EXPLANATION_SUMMARY: Record<TrustAssessmentBand, string> = {
  well_supported:
    "The available evidence is strong and comes from independently corroborated sources, with no substantial contradiction found.",
  weakly_supported:
    "Some evidence supports this claim, but it is not yet strong or independently corroborated.",
  contested: "Both substantial supporting and substantial contradicting evidence exist for this claim.",
  contradicted:
    "The available evidence substantially contradicts this claim, with no substantial supporting evidence found.",
  insufficient_evidence:
    "There is not enough evidence to reach a confident assessment. This does not mean the claim is false - it means insufficient evidence has been found so far.",
};

// Ordering is fixed and deliberate: support/sufficiency first, then
// meaningful contradiction/disagreement, then uncertainty/limitations last -
// never the raw insertion order of any internal array.
export function getClaimExplanation(input: ClaimExplanationInput): ClaimExplanation {
  const band = input.assessmentBand as TrustAssessmentBand;
  const summary = ASSESSMENT_BAND_EXPLANATION_SUMMARY[band] ?? ASSESSMENT_BAND_EXPLANATION_SUMMARY.insufficient_evidence;

  const reasons: ClaimExplanationReason[] = [];

  if (input.independentSupportingCount >= 2) {
    reasons.push({
      type: "support",
      text: `Supported by ${input.independentSupportingCount} independent sources.`,
    });
  } else if (input.independentSupportingCount === 1) {
    reasons.push({
      type: "support",
      text: "Supported by one source, which has not yet been independently corroborated.",
    });
  } else {
    reasons.push({ type: "evidence", text: "No supporting evidence has been found." });
  }

  if (input.directContradictionCount >= 1) {
    reasons.push({
      type: "contradiction",
      text: `${input.directContradictionCount} independent source${
        input.directContradictionCount === 1 ? "" : "s"
      } directly contradict${input.directContradictionCount === 1 ? "s" : ""} this claim.`,
    });
  } else if (input.weakContradictionCount >= 1) {
    reasons.push({
      type: "contradiction",
      text: "Some evidence suggests possible disagreement, though not strong enough to count as a direct contradiction.",
    });
  }

  if (
    band !== "insufficient_evidence" &&
    (input.confidenceLevel === "low" || input.confidenceLevel === "very_low")
  ) {
    reasons.push({
      type: "uncertainty",
      text: "Confidence in this assessment is limited based on the evidence gathered so far.",
    });
  }

  return { summary, reasons };
}

// --- Source type ---
//
// P4.2: EvidenceObject.sourceType is a coarse, hand-picked authority TIER
// (see lib/sourceAuthority.ts's own header: "not a scientifically validated
// measure of trustworthiness... do not present it to users as a precision
// score"). This maps the categorical tier to a neutral, descriptive label -
// never the underlying numeric authorityScore, and never wording that
// implies the category itself vouches for accuracy ("Academic source", not
// "Highly trustworthy academic source").
const SOURCE_TYPE_LABELS: Record<string, string> = {
  government: "Government source",
  academic: "Academic source",
  institutional: "Institutional source",
  journalistic: "News source",
  user_generated: "User-generated source",
  unknown: "Unclassified source",
};

export function getSourceTypeLabel(sourceType?: string | null): string {
  return SOURCE_TYPE_LABELS[sourceType || ""] ?? SOURCE_TYPE_LABELS.unknown;
}

// --- Publication date ---
//
// Absolute date only (no relative "3 days ago" wording, which would read as
// a freshness verdict rather than a plain fact). Never fabricates a date -
// a missing/unparseable publishedAt renders nothing rather than falling
// back to retrievedAt (a different fact: when VeriVerse fetched the source,
// not when the source was published).
export function formatEvidencePublishedDate(publishedAt?: string | Date | null): string | null {
  if (!publishedAt) return null;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// --- Source independence (presentation-only recomputation) ---
//
// Deliberately does NOT read the stored EvidenceObject.independenceGroup
// field. That field is only guaranteed comparable WITHIN one
// persistEvidenceObjects() batch (lib/evidencePersistence.ts computes it via
// lib/sourceIndependence.ts's computeIndependenceGroups, scoped only to the
// candidates in that single call) - two EvidenceObjects from different
// grounding runs could coincidentally carry the same raw group label
// ("group-0") with no real relationship at all. Presenting that as a safe
// independence signal would risk asserting a connection the data doesn't
// actually establish for a Claim whose evidence spans multiple assessment
// versions/runs.
//
// Instead this recomputes a simpler, presentation-only signal fresh from
// the already-public `domain` field of exactly the evidence currently being
// displayed: same normalized host = not independent. This mirrors the same
// conservative "under-merge rather than over-merge" philosophy
// lib/sourceIndependence.ts's own header already documents for the engine's
// version, applied safely at presentation time instead of reusing a value
// whose cross-run comparability isn't guaranteed. It only catches the
// same-domain case, not the engine's rarer cross-domain verbatim-duplicate
// case - a known, deliberate, conservative simplification.
function normalizeDomainForIndependenceNote(domain?: string): string {
  return (domain || "").toLowerCase().trim().replace(/^www\./, "");
}

export type IndependenceNoteInput = { domain?: string };

export function getIndependenceNotes(items: IndependenceNoteInput[]): (string | null)[] {
  const normalized = items.map((item) => normalizeDomainForIndependenceNote(item.domain));
  const counts = new Map<string, number>();
  for (const key of normalized) {
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return normalized.map((key) => {
    if (!key) return null;
    // Deliberately narrower than "not independent": this only proves the
    // two citations share a normalized domain, which is sufficient reason
    // to doubt independence but not sufficient to assert it's disproven -
    // the engine's own grouping can also merge duplicated evidence text
    // across different domains, a case this presentation-layer check
    // cannot see (see the header comment above). Overclaiming "not
    // independent" here would state a conclusion this narrower signal
    // doesn't actually establish.
    return (counts.get(key) || 0) > 1 ? "Same source domain as another citation" : null;
  });
}

// --- Evidence adapter ---
//
// Maps public-safe EvidenceObject fields onto GroundedEvidencePanel's
// existing GroundingSource shape (title/url/domain/stance/stanceEvidence,
// plus the P4.2 additions below). Deliberately does not accept or forward
// authorityScore, relevanceScore, stanceConfidence, independenceGroup,
// contentHash, evidenceHash, providerRunId, provider, canonicalUrl,
// evidenceStart/evidenceEnd, claimId, or claimComponentId - none of those
// are public-safe (see the P3.1 field classification: heuristic scores
// presented as raw numbers would imply false precision about source
// credibility, and the hash/provider/offset fields are pure internal
// plumbing).
export type PublicEvidenceItem = {
  sourceUrl: string;
  domain?: string;
  publisher?: string;
  sourceType?: string;
  publishedAt?: string | Date | null;
  stance: "supports" | "contradicts" | "context" | "unknown";
  evidenceText?: string | null;
};

export type GroundingSourceLike = {
  title: string;
  url: string;
  domain: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
  stanceEvidence?: string | null;
  sourceTypeLabel?: string;
  publishedAtLabel?: string | null;
  independenceNote?: string | null;
};

// Publisher display rule: non-empty publisher, else domain, else "Source".
// Never fabricates a name.
export function getEvidencePublisherLabel(publisher?: string, domain?: string): string {
  if (publisher && publisher.trim()) return publisher.trim();
  if (domain && domain.trim()) return domain.trim();
  return "Source";
}

// independenceNote is computed by the caller (getIndependenceNotes) across
// the full visible evidence set at once, since independence is a property
// of the set, not any single item - this function only formats one item at
// a time, matching its existing (pre-P4.2) contract.
export function toGroundingSource(
  item: PublicEvidenceItem,
  independenceNote: string | null = null
): GroundingSourceLike {
  return {
    title: getEvidencePublisherLabel(item.publisher, item.domain),
    url: item.sourceUrl,
    domain: item.domain || "",
    stance: item.stance,
    stanceEvidence: item.evidenceText ?? null,
    sourceTypeLabel: getSourceTypeLabel(item.sourceType),
    publishedAtLabel: formatEvidencePublishedDate(item.publishedAt),
    independenceNote,
  };
}

// --- Evidence bounding ---
//
// Caps the total evidence returned for a claim page load without letting
// one large bucket (e.g. many "supports" items) starve the others - a
// simple round-robin across the three semantic buckets until the max is
// reached or every bucket is exhausted.
export function boundEvidenceBuckets<T>(
  buckets: { supporting: T[]; contradicting: T[]; context: T[] },
  max: number
): { supporting: T[]; contradicting: T[]; context: T[] } {
  const keys: Array<"supporting" | "contradicting" | "context"> = [
    "supporting",
    "contradicting",
    "context",
  ];
  const result = { supporting: [] as T[], contradicting: [] as T[], context: [] as T[] };
  const indices = { supporting: 0, contradicting: 0, context: 0 };
  let total = 0;

  while (total < max) {
    let addedAny = false;
    for (const key of keys) {
      if (total >= max) break;
      const idx = indices[key];
      if (idx < buckets[key].length) {
        result[key].push(buckets[key][idx]);
        indices[key] += 1;
        total += 1;
        addedAny = true;
      }
    }
    if (!addedAny) break;
  }

  return result;
}

// --- P4.3: uncertainty presentation ---
//
// Answers a different question than P4.1's getClaimExplanation: that
// function explains WHY the assessment came out the way it did (backward-
// looking); this answers WHAT A READER SHOULD BE CAUTIOUS ABOUT when
// interpreting it (forward-looking). Deliberately built from a different,
// narrower slice of the same typed inputs so the two never produce
// duplicate sentences - see getClaimUncertainty's own comments for how each
// reason is kept distinct from its P4.1 counterpart.
//
// Like getClaimExplanation, this never reads assessmentReasons,
// evidenceStrength.reasons, contradictionStrength.reasons, or
// verificationConfidence.reasons - only assessmentBand, confidenceLevel, and
// the three bounded evidence-bucket counts already computed for the API
// response.
export type ClaimUncertaintyReasonType =
  | "confidence"
  | "limited_evidence"
  | "disagreement"
  | "unresolved_evidence";

export type ClaimUncertaintyReason = {
  type: ClaimUncertaintyReasonType;
  text: string;
};

export type ClaimUncertainty = {
  // A ready-to-render qualitative label - deliberately phrased as advice
  // ("Significant caution advised") rather than reusing the Current
  // Assessment card's own "Low confidence" badge wording verbatim, so the
  // two don't read as the same sentence repeated in two places.
  level: string;
  reasons: ClaimUncertaintyReason[];
};

export type ClaimUncertaintyInput = {
  assessmentBand: string;
  confidenceLevel: string;
  supportingCount: number;
  contradictingCount: number;
  contextCount: number;
};

const UNCERTAINTY_CAUTION_LABEL: Record<string, string> = {
  high: "Limited caution needed",
  moderate: "Some caution advised",
  low: "Significant caution advised",
  very_low: "Substantial caution advised",
};

export function getClaimUncertainty(input: ClaimUncertaintyInput): ClaimUncertainty {
  const reasons: ClaimUncertaintyReason[] = [];

  // Mutually exclusive with the generic confidence caution below, mirroring
  // getClaimExplanation's own insufficient_evidence restraint: an
  // insufficient-evidence claim already has this said explicitly and doesn't
  // need a second, redundant "confidence is limited" bullet on top of it.
  // Text is deliberately forward-looking ("may change") rather than
  // P4.1's own explanatory framing of the same band.
  if (input.assessmentBand === "insufficient_evidence") {
    reasons.push({
      type: "limited_evidence",
      text: "Very little evidence has been gathered for this claim so far - this assessment may change as more evidence is found.",
    });
  } else if (input.confidenceLevel === "low" || input.confidenceLevel === "very_low") {
    reasons.push({
      type: "confidence",
      text: "The evidence gathered so far is limited - treat this assessment as provisional rather than final.",
    });
  }

  // Presence of both buckets is a directly observed count, not a
  // reconstruction of the engine's "contested" band logic (which also
  // weighs evidence STRENGTH, not just bucket counts) - safe to state
  // regardless of which exact band the claim landed in.
  if (input.supportingCount > 0 && input.contradictingCount > 0) {
    reasons.push({
      type: "disagreement",
      text: "Evidence exists on both sides of this claim - consider reviewing the supporting and contradicting sources yourself before drawing a conclusion.",
    });
  }

  if (input.contextCount > 0) {
    reasons.push({
      type: "unresolved_evidence",
      text: `${input.contextCount} additional source${input.contextCount === 1 ? "" : "s"} ${
        input.contextCount === 1 ? "is" : "are"
      } available that didn't clearly support or contradict this claim - worth a look for extra context.`,
    });
  }

  const level = UNCERTAINTY_CAUTION_LABEL[input.confidenceLevel] ?? UNCERTAINTY_CAUTION_LABEL.low;

  return { level, reasons };
}

// Distinguishes, within the "context" evidence bucket, evidence that was
// genuinely contextual/unclassified from evidence that WAS stance-classified
// as "contradicts" but got excluded from the authoritative contradiction
// count (wrong proposition/time/jurisdiction - see
// lib/contradictionStrength.ts's classifyContradictionTier). Both
// populations already share the same public "context" bucket
// (TrustAssessment.unresolvedEvidenceIds mixes them - see that field's own
// model comment) and each item's own already-public `stance` field is
// sufficient to tell them apart with zero engine or API changes.
export function getUnresolvedEvidenceCaution(stance: string): string | null {
  if (stance === "contradicts") {
    return "Flagged as a possible contradiction, but not strong enough to count as a direct contradiction for this assessment.";
  }
  return null;
}

// --- P4.3: temporal applicability (Claim-level) ---
//
// Distinct from P4.2's evidence publishedAt: that's when a SOURCE was
// published; this is what time period the CLAIM's own proposition is about
// (Claim.temporalScope, set once at claim-identity time from the claim text
// itself - see lib/claimNormalization.ts's extractTemporalScope). Never
// infers a date from post creation or evidence publication - a claim with
// no explicit temporal language in its own text stays "unspecified" and
// renders nothing here, rather than guessing "now".
//
// Deliberately makes no supersession/freshness claim ("this replaces the
// previous assessment", "this is the latest truth") - temporal supersession
// remains non-authoritative Shadow Mode per the P4.0 audit, untouched here.
export type ClaimTemporalScopeInput = {
  type?: string | null;
  value?: string | null;
};

const TEMPORAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function getClaimTemporalApplicability(scope?: ClaimTemporalScopeInput | null): string | null {
  if (!scope || !scope.type) return null;

  if (scope.type === "specific" && scope.value) {
    const monthYearMatch = /^(\d{4})-(\d{2})$/.exec(scope.value);
    if (monthYearMatch) {
      const monthIndex = Number(monthYearMatch[2]) - 1;
      const monthName = TEMPORAL_MONTH_NAMES[monthIndex];
      // An out-of-range month (00 or 13+) is malformed stored data - omit
      // rather than render a broken sentence like "This assessment applies
      // to undefined 2025."
      if (!monthName) return null;
      return `This assessment applies to ${monthName} ${monthYearMatch[1]}.`;
    }

    const yearMatch = /^\d{4}$/.exec(scope.value);
    if (yearMatch) {
      return `This assessment applies to ${scope.value}.`;
    }

    // A "specific" scope with a value in neither format shouldn't occur
    // today (extractTemporalScope only ever produces YYYY-MM or YYYY), but
    // if stored data ever drifts, omit rather than fabricate a reading of it.
    return null;
  }

  if (scope.type === "relative" && scope.value === "current") {
    // Deliberately does NOT say the assessment itself is current/up to date
    // (that would be the freshness/supersession claim P4.0 ruled out) - only
    // describes what the claim's own text is about.
    return "This claim concerns an ongoing or current situation rather than a specific past date.";
  }

  return null;
}

// --- P4.4: assessment change narrative ---
//
// Answers "what changed between assessment versions, and why does that
// matter?" - NOT "why did the AI change its mind", "who was right", or "what
// is the final truth". Deliberately derived entirely from authoritative
// TrustAssessment rows (one immutable row per version, guaranteed to exist
// for every version) rather than ClaimChangeEvent: that model only records a
// filtered, notification-worthy SUBSET of transitions (see
// lib/claimChangeNotification.ts's classifyClaimChange - same band with no
// support/contradiction zero-crossing produces no event at all), so it has
// systematic gaps by design and would silently under-report real evidence
// changes if used as a history source. TrustAssessment has no such gap.
//
// A shared qualitative label vocabulary for confidence, mirroring
// ClaimPageClient's own CONFIDENCE_LABEL - defined here once so the change
// narrative and the rest of the Claim page always describe the same four
// levels with the same words (see getClaimUncertainty's own distinct,
// advice-phrased "caution" labels, which are deliberately NOT this - they
// answer a different question).
const CONFIDENCE_LEVEL_LABEL: Record<string, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  very_low: "Very low confidence",
};

export function getConfidenceLevelLabel(confidenceLevel?: string | null): string {
  return CONFIDENCE_LEVEL_LABEL[confidenceLevel || ""] ?? "Confidence unknown";
}

const CONFIDENCE_LEVEL_RANK: Record<string, number> = {
  very_low: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

export type AssessmentSnapshotInput = {
  version: number;
  assessmentBand: string;
  confidenceLevel: string;
  // Full ID arrays (not just counts) so real additions/removals can be
  // proven via set membership rather than inferred from a count delta alone
  // - a same-count version with fully different evidence would otherwise
  // look unchanged even though what was actually considered changed.
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  contextEvidenceIds: string[];
};

export type AssessmentChangeType =
  | "band"
  | "supporting_evidence"
  | "contradicting_evidence"
  | "context_evidence"
  | "confidence";

export type AssessmentChange = {
  type: AssessmentChangeType;
  text: string;
};

export type AssessmentTransition = {
  fromVersion: number;
  toVersion: number;
  summary: string;
  changes: AssessmentChange[];
};

// Only ever states what the ID-set comparison actually proves: "more was
// included" (current set is a proper superset - only additions), "some
// previously included evidence is no longer part of this assessment"
// (current set lost members - only removals, provable by set membership,
// not merely a count decrease that could coincidentally hide a same-size
// swap), or "the ... evidence considered changed" (both happened at once).
// Returns null when the two sets are identical - never emits a bullet for
// no-op "same evidence, re-fetched" cases.
function describeEvidenceSetChange(
  label: string,
  type: AssessmentChangeType,
  addedOnlyText: string,
  prevIds: string[],
  currIds: string[]
): AssessmentChange | null {
  const prevSet = new Set(prevIds);
  const currSet = new Set(currIds);
  const added = currIds.some((id) => !prevSet.has(id));
  const removed = prevIds.some((id) => !currSet.has(id));

  if (!added && !removed) return null;

  if (added && !removed) {
    return { type, text: addedOnlyText };
  }
  if (removed && !added) {
    return {
      type,
      text: `Some previously included ${label} evidence is no longer part of this assessment.`,
    };
  }
  return { type, text: `The ${label} evidence considered in this assessment changed.` };
}

// Compares ADJACENT authoritative versions only (v1->v2->v3->...), never
// every historical version against the current one - each transition
// describes a single deterministic step, not a cumulative forensic diff.
// `snapshots` must already be sorted ascending by version (oldest first);
// this function does not re-sort, matching boundEvidenceBuckets' own
// convention of trusting caller-supplied ordering.
export function getAssessmentChangeNarrative(snapshots: AssessmentSnapshotInput[]): AssessmentTransition[] {
  const transitions: AssessmentTransition[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const changes: AssessmentChange[] = [];

    // Ordering is fixed: band change first, then supporting/contradicting/
    // context evidence changes, then confidence change last - never the
    // raw insertion order of any internal computation.
    if (prev.assessmentBand !== curr.assessmentBand) {
      const fromLabel = getClaimAssessmentPresentation(prev.assessmentBand).label;
      const toLabel = getClaimAssessmentPresentation(curr.assessmentBand).label;
      changes.push({ type: "band", text: `Assessment changed from ${fromLabel} to ${toLabel}.` });
    }

    const supportingChange = describeEvidenceSetChange(
      "supporting",
      "supporting_evidence",
      "More supporting evidence was included in this assessment.",
      prev.supportingEvidenceIds,
      curr.supportingEvidenceIds
    );
    if (supportingChange) changes.push(supportingChange);

    const contradictingChange = describeEvidenceSetChange(
      "contradicting",
      "contradicting_evidence",
      "Additional contradicting evidence was included in this assessment.",
      prev.contradictingEvidenceIds,
      curr.contradictingEvidenceIds
    );
    if (contradictingChange) changes.push(contradictingChange);

    const contextChange = describeEvidenceSetChange(
      "unresolved or contextual",
      "context_evidence",
      "More unresolved or contextual evidence was included in this assessment.",
      prev.contextEvidenceIds,
      curr.contextEvidenceIds
    );
    if (contextChange) changes.push(contextChange);

    if (prev.confidenceLevel !== curr.confidenceLevel) {
      const prevRank = CONFIDENCE_LEVEL_RANK[prev.confidenceLevel];
      const currRank = CONFIDENCE_LEVEL_RANK[curr.confidenceLevel];
      // Direction is only stated when both levels are recognized and
      // actually rank differently - an unrecognized level falls back to
      // neutral "changed" wording rather than guessing a direction.
      const direction =
        prevRank !== undefined && currRank !== undefined && currRank !== prevRank
          ? currRank > prevRank
            ? "increased"
            : "decreased"
          : "changed";
      changes.push({
        type: "confidence",
        text: `Assessment confidence ${direction} from ${getConfidenceLevelLabel(
          prev.confidenceLevel
        )} to ${getConfidenceLevelLabel(curr.confidenceLevel)}.`,
      });
    }

    const summary =
      changes.length > 0
        ? `This assessment changed between version ${prev.version} and version ${curr.version}.`
        : "Assessment updated with no material presentation-level change.";

    transitions.push({
      fromVersion: prev.version,
      toVersion: curr.version,
      summary,
      changes,
    });
  }

  return transitions;
}
