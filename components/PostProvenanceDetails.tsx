// components/PostProvenanceDetails.tsx
// P2.4 Level 4: a detail-only, collapsed-by-default disclosure for process/
// provenance context that isn't part of the primary verdict (Level 1) or
// evidence (Levels 2-3) - the AI pre-screening signal (demoted here so it
// no longer competes with the verdict at equal visual weight) and the
// evidence-check state in plain language. Uses only data already available
// on the client; does not add an assessment/"last checked" timestamp - the
// P2.4 audit found none is currently exposed to the client, and inventing
// one here would misrepresent provenance we don't actually have.
"use client";

import { useState } from "react";
import ActionIcon from "@/components/ActionIcons";
import { getAiLabelTone, type DisplayAiLabel } from "@/lib/trustPresentation";

type Props = {
  postId: string;
  displayedAiLabel: DisplayAiLabel;
  groundingStatus?: "not_checked" | "checked" | "insufficient_evidence";
  needsExpertReview?: boolean;
  expertDecision?: string;
  expertReviewReasons?: string[];
};

function getGroundingStateText(status?: Props["groundingStatus"]): string {
  if (status === "checked") {
    return "An automated evidence search has been performed for this claim.";
  }
  if (status === "insufficient_evidence") {
    return "An automated evidence search was performed; the results were too thin or conflicting for a confident conclusion.";
  }
  return "An automated evidence search has not yet been performed for this claim.";
}

export default function PostProvenanceDetails({
  postId,
  displayedAiLabel,
  groundingStatus,
  needsExpertReview,
  expertDecision,
  expertReviewReasons = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const panelId = `post-details-${postId}`;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className="vv-focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border border-veriverse-border bg-white/60 px-4 py-3 text-left transition hover:bg-white"
      >
        <span className="text-sm font-medium text-veriverse-dark">Details</span>
        <ActionIcon
          name="chevronDown"
          className={`text-veriverse-dark/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={panelId} className="vv-post-panel mt-2 space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              AI screening
            </p>
            <span className={`vv-verdict-pill vv-verdict-${getAiLabelTone(displayedAiLabel)}`}>
              {displayedAiLabel.replaceAll("_", " ")}
            </span>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              An automated pre-screening signal used to route this post for review - separate
              from, and not a substitute for, the verdict above.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Evidence check
            </p>
            <p className="text-xs leading-5 text-slate-600">
              {getGroundingStateText(groundingStatus)}
            </p>
          </div>

          {(needsExpertReview || expertDecision) && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Expert review
              </p>
              <p className="text-xs leading-5 text-slate-600">
                {expertDecision
                  ? "An expert has reviewed this claim."
                  : expertReviewReasons.length > 0
                    ? `Flagged for expert review: ${expertReviewReasons.join("; ")}.`
                    : "This claim has been flagged for expert review."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
