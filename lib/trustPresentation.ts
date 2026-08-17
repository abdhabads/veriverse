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

// --- Trust Verdict ---

export type TrustVerdict = {
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
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
    return {
      label: "Expert Verified",
      icon: "✓",
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-300",
      priority: 100,
    };
  }
  if (expertDecision === "false") {
    return {
      label: "Expert Rejected",
      icon: "✗",
      color: "text-red-700",
      bg: "bg-red-50",
      border: "border-red-300",
      priority: 100,
    };
  }
  if (expertDecision === "disputed") {
    return {
      label: "Expert Disputed",
      icon: "⚖",
      color: "text-orange-700",
      bg: "bg-orange-50",
      border: "border-orange-300",
      priority: 100,
    };
  }

  // Review states next
  if (status === "under_expert_review") {
    return {
      label: "Under Expert Review",
      icon: "🔍",
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
      priority: 80,
    };
  }
  if (status === "under_appeal_review") {
    return {
      label: "Under Appeal",
      icon: "📋",
      color: "text-violet-700",
      bg: "bg-violet-50",
      border: "border-violet-200",
      priority: 75,
    };
  }

  // Contradiction evidence overrides score-based verdicts
  const hasContradiction = hasContradictoryEvidence({ contradictionCount, groundingSources });
  if (hasContradiction) {
    return {
      label: "Contradicted",
      icon: "⚠",
      color: "text-rose-700",
      bg: "bg-rose-50",
      border: "border-rose-300",
      priority: 70,
    };
  }

  // Flagged by moderation
  if (status === "flagged") {
    return {
      label: "Flagged",
      icon: "🚩",
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-300",
      priority: 60,
    };
  }

  // Evidence-based verdicts
  const score = verificationScore ?? null;
  if (score !== null && score >= 0.8) {
    return {
      label: "Well Supported",
      icon: "✓",
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      priority: 50,
    };
  }
  if (score !== null && score >= 0.6) {
    return {
      label: "Supported",
      icon: "✓",
      color: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
      priority: 40,
    };
  }
  if (score !== null && score > 0 && score < 0.3) {
    return {
      label: "Weak Evidence",
      icon: "✗",
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      priority: 30,
    };
  }

  // Default
  return {
    label: "Unverified",
    icon: "○",
    color: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
    priority: 0,
  };
}