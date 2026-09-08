// components/TrustSummaryLine.tsx
// One coherent trust unit for the default (collapsed) post card - a verdict
// pill plus support/contradict counts, replacing the previously duplicated
// raw risk/verification line and separate source/support/contradict line.
// Reuses the existing verdict mapping (lib/trustPresentation.ts) rather than
// inventing a second verdict engine.
import { getTrustVerdict, type GroundingSourceLike } from "@/lib/trustPresentation";
import TrustIcon from "@/components/TrustIcons";

type Props = {
  status: string;
  expertDecision?: string | null;
  verificationScore?: number | null;
  contradictionCount?: number;
  supportCount?: number;
  groundingSources?: GroundingSourceLike[];
  groundingStatus?: "not_checked" | "checked" | "insufficient_evidence" | string;
  contentType?: "claim" | "question" | "instruction" | "rhetorical_claim" | string;
};

export default function TrustSummaryLine({
  status,
  expertDecision,
  verificationScore,
  contradictionCount,
  supportCount,
  groundingSources,
  groundingStatus,
  contentType,
}: Props) {
  const verdict = getTrustVerdict({
    status,
    expertDecision,
    verificationScore,
    contradictionCount,
    groundingSources,
    contentType,
  });

  // Support/contradict counts are structurally 0 (never genuinely computed)
  // for content grounding was never run against - showing "0 support · 0
  // contradict" there would misrepresent a skipped check as a real finding
  // of no evidence. Only show counts once grounding has actually run.
  const isNonClaim = contentType === "question" || contentType === "instruction";
  const countsAreReal = !isNonClaim && groundingStatus != null && groundingStatus !== "not_checked";

  return (
    <div
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
      title={verdict.detail ?? `Trust verdict: ${verdict.label}`}
    >
      <span className={`vv-verdict-pill vv-verdict-${verdict.tone}`}>
        <TrustIcon name={verdict.icon} />
        <span>{verdict.label}</span>
      </span>
      {countsAreReal && (
        <span className="text-xs text-slate-500">
          · {Number(supportCount || 0)} support · {Number(contradictionCount || 0)} contradict
        </span>
      )}
    </div>
  );
}
