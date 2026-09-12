"use client";

// components/PostComposer.tsx
// P2.10: extracted verbatim from app/feed/page.tsx's inline "Create a Post"
// card so the exact same composer (fields, status copy, publish button) can
// be reused both in the desktop/tablet inline card and inside the new
// mobile compose sheet, instead of two independent post-creation UIs. Feed
// still owns all state (content, publishPhase, the createPost mutation and
// its timers) - this component is presentation only.
import SectionHeader from "@/components/SectionHeader";
import Button from "@/components/ui/Button";

export type PublishPhase = "idle" | "publishing" | "checking" | "success";

export function getPublishStatusText(phase: PublishPhase): string | null {
  switch (phase) {
    case "publishing":
      return "Publishing…";
    case "checking":
      return "Checking claim against available evidence…";
    case "success":
      return "Published ✓";
    default:
      return null;
  }
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  publishPhase: PublishPhase;
  busy: boolean;
  autoFocus?: boolean;
};

export default function PostComposer({
  value,
  onChange,
  onSubmit,
  publishPhase,
  busy,
  autoFocus = false,
}: Props) {
  return (
    <div>
      <SectionHeader
        title="Create a Post"
        subtitle="Publish a claim, update, or source-backed note. Risk and review signals are attached automatically."
      />

      <textarea
        className="vv-textarea mb-3"
        rows={4}
        placeholder="Share something truthful..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {publishPhase === "idle" ? (
          <p className="text-xs text-slate-500 max-w-xl">
            Use hashtags like #truth #health #politics
          </p>
        ) : (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-xs text-slate-500 max-w-xl"
          >
            {publishPhase !== "success" && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-slate-300 border-t-veriverse-purple animate-spin"
              />
            )}
            {getPublishStatusText(publishPhase)}
          </p>
        )}

        <Button data-testid="publish-button" onClick={onSubmit} loading={busy} variant="primary">
          {publishPhase === "idle" ? "Publish Post" : "Posting..."}
        </Button>
      </div>
    </div>
  );
}
