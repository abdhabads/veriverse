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
};

type TrustVerdictInput = {
  status: string;
  expertDecision?: string | null;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: GroundingSourceLike[];
};

export function shouldShowRawTrustStatus(status: string): boolean {
  return ![
    "flagged",
    "under_expert_review",
    "under_appeal_review",
  ].includes(status);
}

export function getTrustVerdict(input: TrustVerdictInput): TrustVerdict {
  const { status, expertDecision, verificationScore, contradictionCount, groundingSources } = input;

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

  // Evidence-based verdicts
  const score = verificationScore ?? null;
  if (score !== null && score >= 0.8) {
    return { label: "Well Supported", icon: "check", tone: "positive", priority: 50 };
  }
  if (score !== null && score >= 0.6) {
    return { label: "Supported", icon: "check", tone: "positive", priority: 40 };
  }
  if (score !== null && score > 0 && score < 0.3) {
    return { label: "Weak Evidence", icon: "x", tone: "negative", priority: 30 };
  }

  // Default
  return { label: "Unverified", icon: "circle", tone: "neutral", priority: 0 };
}
