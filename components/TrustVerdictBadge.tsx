// components/TrustVerdictBadge.tsx
import { getTrustVerdict, type GroundingSourceLike } from "@/lib/trustPresentation";

type Props = {
  status: string;
  expertDecision?: string | null;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: GroundingSourceLike[];
};

export default function TrustVerdictBadge({
  status,
  expertDecision,
  verificationScore,
  contradictionCount,
  groundingSources,
}: Props) {
  const verdict = getTrustVerdict({
    status,
    expertDecision,
    verificationScore,
    contradictionCount,
    groundingSources,
  });

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${verdict.bg} ${verdict.color} ${verdict.border}`}
      title={`Trust verdict: ${verdict.label}`}
    >
      <span aria-hidden="true" className="text-[11px]">
        {verdict.icon}
      </span>
      <span>{verdict.label}</span>
      {/* Hidden lowercase version for testing */}
      <span className="sr-only">{verdict.label.toLowerCase()}</span>
    </span>
  );
}
