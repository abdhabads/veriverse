import { splitModerationReasons } from "@/lib/moderationReasonLinks";

type ModerationReasonListProps = {
  reasons?: string[];
  textLimit?: number;
  sourceLimit?: number;
  chipClassName?: string;
  sourceTitle?: string;
  className?: string;
};

export default function ModerationReasonList({
  reasons = [],
  textLimit,
  sourceLimit,
  chipClassName = "vv-pill-red",
  sourceTitle = "Fact-check sources",
  className = "",
}: ModerationReasonListProps) {
  const { textReasons, sourceReasons } = splitModerationReasons(reasons);
  const visibleTextReasons =
    typeof textLimit === "number" ? textReasons.slice(0, textLimit) : textReasons;
  const visibleSourceReasons =
    typeof sourceLimit === "number"
      ? sourceReasons.slice(0, sourceLimit)
      : sourceReasons;

  if (visibleTextReasons.length === 0 && visibleSourceReasons.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {visibleTextReasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleTextReasons.map((reason) => (
            <span key={reason} className={chipClassName}>
              {reason}
            </span>
          ))}
        </div>
      )}

      {visibleSourceReasons.length > 0 && (
        <div className={visibleTextReasons.length > 0 ? "mt-2" : ""}>
          <p className="text-xs text-slate-500 mb-1">{sourceTitle}</p>
          <div className="space-y-1">
            {visibleSourceReasons.map((source) => (
              <div key={`${source.url}-${source.stance}`} className="text-xs">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="vv-link-accent"
                >
                  {source.label}
                </a>
                <span className="ml-2 text-slate-500">{source.stance}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}