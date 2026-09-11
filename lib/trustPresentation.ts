import type { TrustIconName } from "@/components/TrustIcons";

export type GroundingSourceLike = {
  stance?: "supports" | "contradicts" | "context" | "unknown";
};

type TrustPresentationInput = {
  aiLabel?: "safe" | "suspicious" | "needs_review" | "high_risk" | string;
  contradictionCount?: number;
  groundingSources?: GroundingSourceLike[];
};

export type DisplayAiLabel = "safe" | "suspicious" | "needs_review" | "high_risk" | "contradicted";

export function hasContradictoryEvidence(input: TrustPresentationInput): boolean {
  if (Number(input.contradictionCount || 0) > 0) {
    return true;
  }

  return Array.isArray(input.groundingSources)
    ? input.groundingSources.some((source) => source?.stance === "contradicts")
    : false;
}

export function getDisplayedAiLabel(input: TrustPresentationInput): DisplayAiLabel {
  if (String(input.aiLabel || "") === "safe" && hasContradictoryEvidence(input)) {
    return "contradicted";
  }

  switch (input.aiLabel) {
    case "high_risk":
    case "needs_review":
    case "suspicious":
    case "safe":
      return input.aiLabel;
    default:
      return "safe";
  }
}

export function getAiLabelTone(label: DisplayAiLabel): TrustTone {
  switch (label) {
    case "safe":
      return "positive";
    case "suspicious":
    case "needs_review":
      return "review";
    case "high_risk":
    case "contradicted":
      return "negative";
    default:
      return "neutral";
  }
}

// --- Trust Verdict ---

// A disciplined 4-tone language shared across TrustVerdictBadge,
// VerificationBadge, and GroundedEvidencePanel's stance pills: "positive"
// (green), "negative" (red), "review" (gold - needs human attention), and
// "neutral" (unresolved). Every verdict/stance maps onto one of these
// rather than each component picking its own ad hoc color.
export type TrustTone = "positive" | "negative" | "review" | "neutral";

export type TrustVerdict = {
  label: string;
  icon: TrustIconName;
  tone: TrustTone;
  priority: number;
  detail?: string;
};

// Exported so renderers that need to independently derive a canonical
// verdict (e.g. VerificationBadge, the feed's verdict filter) can share the
// exact input shape getTrustVerdict() takes, rather than each retyping it
// and risking a field getting silently missed on one side.
export type TrustVerdictInput = {
  status: string;
  expertDecision?: string | null;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: GroundingSourceLike[];
  contentType?: "claim" | "question" | "instruction" | "rhetorical_claim" | string;
};

export const NOT_A_CLAIM_DETAIL =
  "This reads as a question or instruction rather than a claim - VeriVerse verifies factual assertions. Try rephrasing as a statement to get a verification check.";

export function shouldShowRawTrustStatus(status: string): boolean {
  return ![
    "flagged",
    "under_expert_review",
    "under_appeal_review",
  ].includes(status);
}

export function getTrustVerdict(input: TrustVerdictInput): TrustVerdict {
  const { status, expertDecision, verificationScore, contradictionCount, groundingSources, contentType } = input;

  // Expert decisions always take highest priority
  if (expertDecision === "verified") {
    return { label: "Expert Verified", icon: "check", tone: "positive", priority: 100 };
  }
  if (expertDecision === "false") {
    return { label: "Expert Rejected", icon: "x", tone: "negative", priority: 100 };
  }
  if (expertDecision === "disputed") {
    return { label: "Expert Disputed", icon: "alert", tone: "review", priority: 100 };
  }

  // Review states next
  if (status === "under_expert_review") {
    return { label: "Under Expert Review", icon: "search", tone: "review", priority: 80 };
  }
  if (status === "under_appeal_review") {
    return { label: "Under Appeal", icon: "clipboard", tone: "review", priority: 75 };
  }

  // Contradiction evidence overrides score-based verdicts
  const hasContradiction = hasContradictoryEvidence({ contradictionCount, groundingSources });
  if (hasContradiction) {
    return { label: "Contradicted", icon: "alert", tone: "negative", priority: 70 };
  }

  // Flagged by moderation
  if (status === "flagged") {
    return { label: "Flagged", icon: "flag", tone: "review", priority: 60 };
  }

  // Content with no extractable assertion never gets an evidence-based
  // verdict - grounding was skipped entirely (not run and found weak), so
  // any score on record is a structural default, not a real signal. This
  // only applies to "question"/"instruction"; "rhetorical_claim" is fully
  // evaluated on its extracted assertion and falls through to the normal
  // evidence-based verdicts below like any other claim.
  if (contentType === "question" || contentType === "instruction") {
    return {
      label: "Not a Claim",
      icon: "circle",
      tone: "neutral",
      priority: 35,
      detail: NOT_A_CLAIM_DETAIL,
    };
  }

  // Evidence-based verdicts. A null score means assessment genuinely hasn't
  // occurred yet ("Unverified"); any non-null score means evaluation DID
  // run and landed somewhere on the scale - even a low result (including
  // exactly 0) is evaluated evidence, not an absence of assessment, so it
  // must never share a label with the true not-yet-evaluated case.
  const score = verificationScore ?? null;
  if (score !== null && score >= 0.8) {
    return { label: "Well Supported", icon: "check", tone: "positive", priority: 50 };
  }
  if (score !== null && score >= 0.6) {
    return { label: "Supported", icon: "check", tone: "positive", priority: 40 };
  }
  if (score !== null) {
    return { label: "Weak Evidence", icon: "x", tone: "negative", priority: 30 };
  }

  // Default - score is genuinely null, nothing has been evaluated yet.
  return { label: "Unverified", icon: "circle", tone: "neutral", priority: 0 };
}

// --- Evidence Strength (P2.4) ---

// Answers a different question than the verdict above ("how much evidence
// is available" vs. "what does VeriVerse conclude"). Prior to P2.4 this
// lived in VerificationBadge as a second, independently-tuned threshold
// table (0.8/0.6/0.3) that ignored expertDecision/contradictionCount
// entirely - so the same post could show "Expert Rejected"/"Contradicted"
// from getTrustVerdict() above and "Strong Evidence" from that second table
// at the same time. Reusing getTrustVerdict()'s own 0.8/0.6 bands here (no
// third 0.3 tier) makes that specific drift structurally impossible: when
// both are visible they are reading the same score through the same bands.
//
// The tiers where getTrustVerdict() did NOT decide the verdict from the
// score - expert decisions, review states, contradiction, flagged - are
// exactly the tiers where a separately-labelled strength pill would still
// visually compete with the verdict even with unified bands (a "Strong"
// pill next to "Expert Rejected" reads as contradictory regardless of
// matching colors). getEvidenceStrength() stays hidden in those cases
// rather than asserting a magnitude the verdict didn't use.
const PURE_EVIDENCE_VERDICT_PRIORITIES = new Set([0, 30, 40, 50]);

export type EvidenceStrengthPresentation =
  | { visible: false }
  | {
      visible: true;
      label: "Strong" | "Moderate" | "Limited";
      tone: TrustTone;
      icon: TrustIconName;
      score: number;
    };

export function getEvidenceStrength(
  verdict: TrustVerdict,
  verificationScore?: number | null
): EvidenceStrengthPresentation {
  if (!PURE_EVIDENCE_VERDICT_PRIORITIES.has(verdict.priority)) {
    return { visible: false };
  }

  const score = verificationScore ?? null;
  if (score === null) {
    // The canonical verdict already reads "Unverified" in this case - a
    // second "not evaluated" signal here would just duplicate it.
    return { visible: false };
  }

  if (score >= 0.8) {
    return { visible: true, label: "Strong", tone: "positive", icon: "check", score };
  }
  if (score >= 0.6) {
    return { visible: true, label: "Moderate", tone: "positive", icon: "check", score };
  }
  return { visible: true, label: "Limited", tone: "negative", icon: "x", score };
}
