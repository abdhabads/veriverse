"use client";

// components/MessageBubble.tsx
// P2.8: extracted from app/messages/[id]/page.tsx so the thread page reads
// as list-of-bubbles rather than inline markup, and so the relative-time
// swap (replacing the raw toLocaleString() the P2.8 audit flagged) lives in
// one place. `grouped` is presentation-only (tighter spacing when the
// previous bubble is from the same sender) - it never changes the
// underlying unbounded message list or its polling.
import { formatRelativeTime } from "@/components/PostCard";

type Props = {
  content: string;
  createdAt: string;
  mine: boolean;
  grouped?: boolean;
};

export default function MessageBubble({ content, createdAt, mine, grouped = false }: Props) {
  return (
    <div
      data-testid="message-bubble"
      data-mine={mine ? "true" : "false"}
      className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${grouped ? "mt-1" : "mt-3"} ${
        mine ? "self-end bg-veriverse-purple text-white" : "self-start bg-slate-100 text-slate-800"
      }`}
    >
      <p className="whitespace-pre-wrap">{content}</p>
      <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
        {formatRelativeTime(createdAt)}
      </p>
    </div>
  );
}
