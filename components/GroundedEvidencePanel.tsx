import TrustIcon, { type TrustIconName } from "@/components/TrustIcons";
import type { TrustTone } from "@/lib/trustPresentation";
import { truncateAtSentence } from "@/lib/textUtils";

type GroundingSource = {
  title: string;
  url: string;
  domain: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
  stanceEvidence?: string | null;
};

type EvidenceAssessment = {
  supportStrength?: "none" | "weak" | "moderate" | "strong";
  contradictionStrength?: "none" | "weak" | "moderate" | "strong";
  independentSupportingCount?: number;
  independentContradictingCount?: number;
  explanation?: string;
};

type GroundedEvidencePanelProps = {
  groundingStatus?: "not_checked" | "checked" | "insufficient_evidence";
  groundingSummary?: string;
  groundingSources?: GroundingSource[];
  groundingConfidence?: number;
  contradictionCount?: number;
  supportCount?: number;
  // When present, its explanation and independent counts are preferred over
  // the cruder groundingSummary/supportCount/contradictionCount fields -
  // this is the same underlying assessment, just a more explainable, less
  // duplicate-prone version of it (see models/Post.ts's EvidenceAssessmentSchema
  // comment). Falls back cleanly to the older fields when absent, so legacy
  // posts created before this field existed still render correctly.
  evidenceAssessment?: EvidenceAssessment;
  // Accepted for backward compatibility with existing callers (e.g. the post
  // detail page) - no longer rendered here. The panel's own verdict-adjacent
  // badge was a second, independently-drifted verdict engine (see
  // VerificationBadge's own getBadgeConfig) duplicating - and sometimes
  // disagreeing with - the single-source-of-truth verdict already shown via
  // TrustSummaryLine above this panel. Removed rather than reconciled here,
  // since fixing VerificationBadge itself is out of this slice's boundary.
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

const STANCE_PRESENTATION: Record<
  GroundingSource["stance"],
  { tone: TrustTone; icon: TrustIconName }
> = {
  supports: { tone: "positive", icon: "check" },
  contradicts: { tone: "negative", icon: "x" },
  context: { tone: "review", icon: "alert" },
  unknown: { tone: "neutral", icon: "circle" },
};

// "2 sources · 1 domain" - lets a reader see at a glance whether multiple
// sources are actually independent evidence or just multiple articles off
// the same site. Domain-less sources (older posts, or missing data) are
// excluded from the unique-domain tally rather than counted as distinct
// domains or crashing the count.
function formatSourceDomainSummary(sourceCount: number, uniqueDomainCount: number): string {
  const sourcesLabel = `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;

  // A single source, or no usable domain data at all, makes a domain count
  // either redundant or meaningless - just show the source count.
  if (sourceCount <= 1 || uniqueDomainCount === 0) {
    return sourcesLabel;
  }

  return `${sourcesLabel} · ${uniqueDomainCount} domain${uniqueDomainCount === 1 ? "" : "s"}`;
}

export function getEvidenceSummary(
  groundingStatus?: GroundedEvidencePanelProps["groundingStatus"],
  groundingSummary?: string,
  sourceCount?: number,
  explanation?: string
) {
  // The evidence-assessment explanation is a more explainable, purpose-built
  // summary of the same assessment - prefer it when present.
  if (explanation?.trim()) {
    return explanation.trim();
  }

  if (groundingSummary?.trim()) {
    return groundingSummary.trim();
  }

  if (groundingStatus === "insufficient_evidence") {
    return "Available evidence is still too thin or conflicting for a confident conclusion.";
  }

  if ((sourceCount || 0) > 0) {
    return "Supporting source context has been collected for this claim.";
  }

  return "No evidence has been attached yet.";
}

export default function GroundedEvidencePanel({
  groundingStatus,
  groundingSummary,
  groundingSources = [],
  groundingConfidence,
  contradictionCount,
  supportCount,
  evidenceAssessment,
  maxSources,
  compact = false,
}: GroundedEvidencePanelProps) {
  const hasEvidence =
    Boolean(groundingSummary?.trim()) ||
    Boolean(evidenceAssessment?.explanation?.trim()) ||
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
    groundingSources.length,
    evidenceAssessment?.explanation
  );

  // Independent (deduplicated) counts from the evidence assessment are more
  // precise than the cruder raw supportCount/contradictionCount - prefer
  // them when present, falling back for legacy posts that predate this field.
  const displaySupportCount =
    evidenceAssessment?.independentSupportingCount ?? supportCount;
  const displayContradictionCount =
    evidenceAssessment?.independentContradictingCount ?? contradictionCount;

  const uniqueDomainCount = new Set(
    groundingSources
      .map((source) => source.domain?.trim())
      .filter((domain): domain is string => Boolean(domain))
  ).size;

  const sourceDomainSummary =
    groundingSources.length > 0
      ? formatSourceDomainSummary(groundingSources.length, uniqueDomainCount)
      : null;

  return (
    <div className="vv-post-panel mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-veriverse-dark/60">
          Evidence
        </p>
        {groundingStatus === "insufficient_evidence" ? (
          <span className="vv-verdict-pill vv-verdict-review text-[10px] uppercase tracking-[0.16em]">
            Insufficient Evidence
          </span>
        ) : null}
      </div>

      <p className="mb-3 text-sm leading-6 text-veriverse-dark/80">{summary}</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {sourceDomainSummary ? (
          <span className="vv-verdict-pill vv-verdict-neutral">
            {sourceDomainSummary}
          </span>
        ) : null}
        <span className="vv-verdict-pill vv-verdict-neutral">
          Evidence confidence: {Math.round(Number(groundingConfidence || 0))}%
        </span>
        <span className="vv-verdict-pill vv-verdict-positive">
          Supports: {Number(displaySupportCount || 0)}
        </span>
        <span className="vv-verdict-pill vv-verdict-negative">
          Contradictions: {Number(displayContradictionCount || 0)}
        </span>
      </div>

      {visibleSources.length > 0 ? (
        <div className="space-y-3">
          {visibleSources.map((source) => {
            const presentation = STANCE_PRESENTATION[source.stance];
            return (
              <div
                key={`${source.url}-${source.stance}`}
                className="rounded-2xl border border-veriverse-border bg-white/70 px-3 py-3 text-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`vv-stance-pill vv-verdict-${presentation.tone}`}>
                    <TrustIcon name={presentation.icon} size={11} />
                    {source.stance}
                  </span>
                  <span className="text-xs text-veriverse-dark/50">{source.domain}</span>
                </div>

                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="vv-link-accent block font-medium"
                >
                  {source.title || source.domain}
                </a>

                {source.stanceEvidence?.trim() ? (
                  <p className="mt-1 text-xs leading-5 text-veriverse-dark/60">
                    <span className="font-medium not-italic text-veriverse-dark/45">
                      From the research:{" "}
                    </span>
                    <span className="italic">
                      &ldquo;{truncateAtSentence(source.stanceEvidence.trim(), 180)}&rdquo;
                    </span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-veriverse-dark/50">
          No source links are attached yet.
        </p>
      )}

      {compact && groundingSources.length > visibleSources.length ? (
        <p className="mt-3 text-xs text-veriverse-dark/50">
          {groundingSources.length - visibleSources.length} more evidence source
          {groundingSources.length - visibleSources.length === 1 ? "" : "s"} available in post detail.
        </p>
      ) : null}
    </div>
  );
}
