import VerificationBadge from "@/components/VerificationBadge";

type GroundingSource = {
  title: string;
  url: string;
  domain: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
};

type GroundedEvidencePanelProps = {
  groundingStatus?: "not_checked" | "checked" | "insufficient_evidence";
  groundingSummary?: string;
  groundingSources?: GroundingSource[];
  groundingConfidence?: number;
  contradictionCount?: number;
  supportCount?: number;
  verificationScore?: number | null;
  maxSources?: number;
  compact?: boolean;
};

const STANCE_PRIORITY: Record<GroundingSource["stance"], number> = {
  contradicts: 0,
  supports: 1,
  context: 2,
  unknown: 3,
};

function getStanceBadgeClass(stance: GroundingSource["stance"]) {
  switch (stance) {
    case "supports":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "contradicts":
      return "bg-rose-50 text-rose-700 border border-rose-200";
    case "context":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

function getEvidenceSummary(
  groundingStatus?: GroundedEvidencePanelProps["groundingStatus"],
  groundingSummary?: string,
  sourceCount?: number
) {
  if (groundingSummary?.trim()) {
    return groundingSummary.trim();
  }

  if (groundingStatus === "insufficient_evidence") {
    return "Available evidence is still too thin or conflicting for a confident conclusion.";
  }

  if ((sourceCount || 0) > 0) {
    return "Supporting source context has been collected for this claim.";
  }

  return "No grounded evidence has been attached yet.";
}

export default function GroundedEvidencePanel({
  groundingStatus,
  groundingSummary,
  groundingSources = [],
  groundingConfidence,
  contradictionCount,
  supportCount,
  verificationScore,
  maxSources,
  compact = false,
}: GroundedEvidencePanelProps) {
  const hasEvidence =
    Boolean(groundingSummary?.trim()) ||
    groundingSources.length > 0 ||
    groundingStatus === "insufficient_evidence";

  if (!hasEvidence) {
    return null;
  }

  const visibleSources = [...groundingSources]
    .sort((left, right) => STANCE_PRIORITY[left.stance] - STANCE_PRIORITY[right.stance])
    .slice(0, maxSources ?? groundingSources.length);

  const summary = getEvidenceSummary(
    groundingStatus,
    groundingSummary,
    groundingSources.length
  );

  return (
    <div className="vv-post-panel mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
          Grounded Evidence
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {verificationScore != null && (
            <VerificationBadge score={verificationScore} showScore={true} />
          )}
          {groundingStatus === "insufficient_evidence" ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              Insufficient Evidence
            </span>
          ) : null}
        </div>
      </div>

      <p className="mb-3 text-sm leading-6 text-slate-700">{summary}</p>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          Confidence: {Number(groundingConfidence || 0)}
        </span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          Supports: {Number(supportCount || 0)}
        </span>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
          Contradictions: {Number(contradictionCount || 0)}
        </span>
      </div>

      {visibleSources.length > 0 ? (
        <div className="space-y-3">
          {visibleSources.map((source) => (
            <div
              key={`${source.url}-${source.stance}`}
              className="rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-3 text-sm"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getStanceBadgeClass(source.stance)}`}
                >
                  {source.stance}
                </span>
                <span className="text-xs text-slate-500">{source.domain}</span>
              </div>

              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="vv-link-accent block font-medium"
              >
                {source.title || source.domain}
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          No source links are attached to this grounding result yet.
        </p>
      )}

      {compact && groundingSources.length > visibleSources.length ? (
        <p className="mt-3 text-xs text-slate-500">
          {groundingSources.length - visibleSources.length} more evidence source
          {groundingSources.length - visibleSources.length === 1 ? "" : "s"} available in post detail.
        </p>
      ) : null}
    </div>
  );
}