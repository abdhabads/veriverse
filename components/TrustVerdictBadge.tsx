// components/TrustVerdictBadge.tsx
import { getTrustVerdict, type GroundingSourceLike } from "@/lib/trustPresentation";
import TrustIcon from "@/components/TrustIcons";

type Props = {
  status: string;
  expertDecision?: string | null;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: GroundingSourceLike[];
  contentType?: "claim" | "question" | "instruction" | "rhetorical_claim" | string;
};

export default function TrustVerdictBadge({
  status,
  expertDecision,
  verificationScore,
  contradictionCount,
  groundingSources,
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

  return (
    <span
      className={`vv-verdict-pill vv-verdict-${verdict.tone}`}
      title={verdict.detail ?? `Trust verdict: ${verdict.label}`}
    >
      <TrustIcon name={verdict.icon} />
      <span>{verdict.label}</span>
      {/* Hidden lowercase version for testing */}
      <span className="sr-only">{verdict.label.toLowerCase()}</span>
    </span>
  );
}
