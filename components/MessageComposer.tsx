"use client";

// components/MessageComposer.tsx
// P2.8: extracted from app/messages/[id]/page.tsx. The backend's message
// content cap (models/Message.ts / cleanString maxLength 2000) previously
// had no client-side echo at all - a user could type past it with no
// warning until the send failed. Mirrors the character-count treatment
// CommentComposer already established for the (unrelated, 300-char)
// comment limit, without sharing code, since one is a single-line message
// input with Enter-to-send and the other is a multiline reply textarea.
const MAX_LENGTH = 2000;
const WARNING_THRESHOLD = MAX_LENGTH - 200;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
};

export default function MessageComposer({ value, onChange, onSubmit, submitting = false }: Props) {
  const isEmpty = !value.trim();
  const nearLimit = value.length >= WARNING_THRESHOLD;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          className="vv-input flex-1"
          placeholder="Write a message"
          aria-label="Write a message"
          value={value}
          maxLength={MAX_LENGTH}
          disabled={submitting}
          data-testid="message-input"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="button"
          className="vv-btn-primary"
          disabled={submitting || isEmpty}
          data-testid="message-send"
          onClick={onSubmit}
        >
          {submitting ? "Sending..." : "Send"}
        </button>
      </div>
      <span className={`self-end text-xs ${nearLimit ? "text-amber-600" : "text-slate-400"}`}>
        {value.length}/{MAX_LENGTH}
      </span>
    </div>
  );
}
