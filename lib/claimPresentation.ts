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
