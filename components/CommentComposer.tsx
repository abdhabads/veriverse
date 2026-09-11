// components/CommentComposer.tsx
// P2.6: one shared composer for both a top-level comment and a reply,
// replacing what were two separately-written textareas with no submit
// feedback, no length guidance, and no explicit way to back out of a
// reply besides re-clicking the same toggle. Character-limit handling is
// presentation only - the 300-char ceiling itself lives in the Comment
// schema and the PATCH route's validation, unchanged here.
"use client";

const MAX_LENGTH = 300;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  replyToUsername?: string | null;
  onCancelReply?: () => void;
  autoFocus?: boolean;
};

export default function CommentComposer({
  value,
  onChange,
  onSubmit,
  submitting = false,
  replyToUsername,
  onCancelReply,
  autoFocus = false,
}: Props) {
  const isReply = Boolean(replyToUsername);
  const isEmpty = !value.trim();

  return (
    <div className="vv-post-comment-shell">
      {isReply && (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Replying to <span className="font-medium text-veriverse-dark">@{replyToUsername}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="vv-link"
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      )}

      <textarea
        className="vv-textarea mb-2"
        rows={isReply ? 2 : 3}
        maxLength={MAX_LENGTH}
        aria-label={isReply ? `Reply to ${replyToUsername}` : "Write a comment"}
        placeholder={isReply ? `Reply to ${replyToUsername}...` : "Write a comment..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {value.length}/{MAX_LENGTH}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || isEmpty}
          className="vv-btn-primary"
        >
          {submitting ? (isReply ? "Replying…" : "Posting…") : isReply ? "Send Reply" : "Post Comment"}
        </button>
      </div>
    </div>
  );
}
