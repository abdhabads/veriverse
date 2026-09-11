// components/CommentItem.tsx
// P2.6: standardized comment/reply anatomy - avatar -> linked username ->
// relative timestamp -> body -> actions. Avatar/username link to the
// author's profile (previously nowhere in the discussion could you reach a
// commenter's profile at all). Deliberately does not render reputation or
// any role/expert badge in this slice - see the P2.6 implementation
// decision to keep participant identity to avatar+name+time only, so
// discussion doesn't start reading as authority-weighted by contribution
// history.
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import CommentComposer from "@/components/CommentComposer";
import CommentActions from "@/components/CommentActions";
import { formatRelativeTime } from "@/components/PostCard";

export type CommentAuthor = {
  _id: string;
  username: string;
  avatarUrl?: string;
};

export type Comment = {
  _id: string;
  content: string;
  createdAt: string;
  // Already present on every comment API response (mongoose `timestamps`),
  // just never typed/read client-side before P2.6 - drives the "(edited)"
  // marker below without any backend change.
  updatedAt?: string;
  parentComment?: string | null;
  isDeleted?: boolean;
  author: CommentAuthor;
};

type Props = {
  comment: Comment;
  // Bare rows (actual depth >= 2) skip the bordered/padded card chrome
  // entirely - a card nested inside a card inside a card is what actually
  // ate mobile width in the pre-P2.6 implementation, not just the
  // per-level margin. Bounding indentation alone does not fix that unless
  // deep replies also stop each carrying their own card padding.
  bare?: boolean;
  // Shown for any reply (actual depth >= 1) - depth 1 and depth >= 2 render
  // at the same visual indentation, so both need this label; without it a
  // depth-2+ reply would be visually indistinguishable from a new depth-1
  // reply to the same top-level comment.
  parentUsername?: string;
  canEdit: boolean;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  editSubmitting: boolean;
  onRequestDelete: () => void;
  isReplying: boolean;
  replyValue: string;
  onReplyValueChange: (value: string) => void;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSubmitReply: () => void;
  replySubmitting: boolean;
  children?: React.ReactNode;
};

export default function CommentItem({
  comment,
  bare = false,
  parentUsername,
  canEdit,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  editSubmitting,
  onRequestDelete,
  isReplying,
  replyValue,
  onReplyValueChange,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  replySubmitting,
  children,
}: Props) {
  const router = useRouter();
  const goToProfile = () => {
    if (comment.author?.username) router.push(`/u/${comment.author.username}`);
  };

  return (
    <div className={bare ? "border-t border-black/5 pt-3" : "vv-post-comment-thread"}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={goToProfile} aria-label={`View ${comment.author?.username}'s profile`}>
            {comment.author?.avatarUrl ? (
              <Image
                src={comment.author.avatarUrl}
                alt={comment.author.username}
                width={32}
                height={32}
                unoptimized
                className="w-8 h-8 rounded-full object-cover border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
                {comment.author?.username?.slice(0, 1)?.toUpperCase()}
              </div>
            )}
          </button>

          <div>
            <button
              type="button"
              onClick={goToProfile}
              className="text-sm font-medium text-veriverse-dark hover:underline"
            >
              {comment.author?.username}
            </button>
            <p className="text-xs text-slate-500">
              {formatRelativeTime(comment.createdAt)}
              {comment.updatedAt && comment.updatedAt !== comment.createdAt && !comment.isDeleted && (
                <span> · edited</span>
              )}
            </p>
          </div>
        </div>

        {canEdit && !comment.isDeleted && (
          <CommentActions
            label={`Actions for comment by ${comment.author?.username}`}
            onEdit={onStartEdit}
            onDelete={onRequestDelete}
          />
        )}
      </div>

      {parentUsername && (
        <p className="mt-2 text-xs text-slate-500">
          Replying to <span className="font-medium text-veriverse-dark">@{parentUsername}</span>
        </p>
      )}

      {isEditing ? (
        <div className="mt-3">
          <textarea
            className="vv-textarea mb-2"
            rows={3}
            maxLength={300}
            aria-label="Edit comment"
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={onSaveEdit}
              disabled={editSubmitting || !editContent.trim()}
              className="vv-btn-primary"
            >
              {editSubmitting ? "Saving…" : "Save"}
            </button>
            <button onClick={onCancelEdit} disabled={editSubmitting} className="vv-btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-700 mt-3">{comment.content}</p>
      )}

      {!comment.isDeleted && (
        <div className="mt-3">
          {!isReplying && (
            <button onClick={onStartReply} className="vv-btn-secondary text-xs">
              Reply
            </button>
          )}

          {isReplying && (
            <div className="mt-3">
              <CommentComposer
                value={replyValue}
                onChange={onReplyValueChange}
                onSubmit={onSubmitReply}
                submitting={replySubmitting}
                replyToUsername={comment.author?.username}
                onCancelReply={onCancelReply}
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      {children && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
