"use client";

// components/ConversationListItem.tsx
// P2.8: extracted from app/messages/page.tsx. Swaps the raw
// toLocaleString() timestamp for the same relative-time convention already
// used by Posts/Comments/the message thread, and gives the row an explicit
// accessible name (username + unread state + preview) instead of relying
// on the unread dot's own aria-label alone to carry that information.
import { formatRelativeTime } from "@/components/PostCard";

type Props = {
  username: string;
  avatarUrl?: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  isUnread: boolean;
  onClick: () => void;
  testId?: string;
};

export default function ConversationListItem({
  username,
  avatarUrl,
  lastMessagePreview,
  lastMessageAt,
  isUnread,
  onClick,
  testId,
}: Props) {
  const preview = lastMessagePreview || "No messages yet";
  const accessibleName = `${username}${isUnread ? ", unread" : ""}: ${preview}`;

  return (
    <button
      type="button"
      data-testid={testId}
      data-unread={isUnread ? "true" : "false"}
      aria-label={accessibleName}
      onClick={onClick}
      className={`vv-post-panel w-full text-left flex items-center gap-3 ${
        isUnread ? "border-veriverse-purple/50" : ""
      }`}
    >
      {isUnread && (
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-veriverse-purple" />
      )}

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-10 h-10 rounded-full object-cover border"
        />
      ) : (
        <div
          aria-hidden="true"
          className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500"
        >
          {username.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isUnread ? "font-bold" : "font-semibold"}`}>{username}</p>
        <p
          className={`text-sm truncate ${
            isUnread ? "text-slate-800 font-medium" : "text-slate-500"
          }`}
        >
          {preview}
        </p>
      </div>

      {lastMessageAt && (
        <p className="text-xs text-slate-400 whitespace-nowrap">{formatRelativeTime(lastMessageAt)}</p>
      )}
    </button>
  );
}
