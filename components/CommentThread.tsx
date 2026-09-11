// components/CommentThread.tsx
// P2.6: recursive thread rendering with backend nesting left unbounded
// (parentComment chains are walked exactly as before - nothing here
// re-parents or flattens the data) while visual indentation is capped at
// one level. The P2.6 audit found the previous implementation added a
// fresh 24px of margin AND a fresh bordered/padded card at every single
// level, so four real backend levels already clipped a Delete button off
// a 390px screen. Capping only the margin would still leave the padding
// compounding, so depth >= 2 also drops the card chrome itself (see
// CommentItem's `bare` prop) - every comment past the first reply level
// renders as a lightweight divided row, with an explicit "Replying to
// @username" label taking over the job indentation used to do alone.
"use client";

import CommentItem, { type Comment } from "@/components/CommentItem";

export type { Comment };

type Handlers = {
  currentUserId?: string;
  isAdmin: boolean;
  editingCommentId: string | null;
  editContent: string;
  onEditContentChange: (value: string) => void;
  onStartEdit: (commentId: string, existingContent: string) => void;
  onSaveEdit: (commentId: string) => void;
  onCancelEdit: () => void;
  editSubmittingId: string | null;
  onRequestDelete: (commentId: string) => void;
  replyingTo: string | null;
  replyValues: Record<string, string>;
  onReplyValueChange: (commentId: string, value: string) => void;
  onStartReply: (commentId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (commentId: string) => void;
  replySubmittingId: string | null;
};

type Props = Handlers & {
  parentKey: string;
  level: number;
  commentsByParent: Record<string, Comment[]>;
  commentsById: Record<string, Comment>;
};

// Pure, extracted so both the "clip a Delete button" failure mode and the
// parent-disambiguation behavior are directly testable without mounting a
// component tree.
export function isBareDepth(level: number): boolean {
  return level >= 2;
}

export function resolveParentUsername(
  comment: Comment,
  level: number,
  commentsById: Record<string, Comment>
): string | undefined {
  if (level < 1 || !comment.parentComment) return undefined;
  return commentsById[comment.parentComment]?.author?.username;
}

export default function CommentThread(props: Props) {
  const { parentKey, level, commentsByParent, commentsById, ...handlers } = props;
  const items = commentsByParent[parentKey] || [];

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((comment) => {
        const canEdit =
          Boolean(handlers.currentUserId) &&
          (handlers.currentUserId === comment.author?._id || handlers.isAdmin);
        const parentUsername = resolveParentUsername(comment, level, commentsById);
        const hasReplies = Boolean(commentsByParent[comment._id]?.length);

        return (
          <CommentItem
            key={comment._id}
            comment={comment}
            bare={isBareDepth(level)}
            parentUsername={parentUsername}
            canEdit={canEdit}
            isEditing={handlers.editingCommentId === comment._id}
            editContent={handlers.editContent}
            onEditContentChange={handlers.onEditContentChange}
            onStartEdit={() => handlers.onStartEdit(comment._id, comment.content)}
            onSaveEdit={() => handlers.onSaveEdit(comment._id)}
            onCancelEdit={handlers.onCancelEdit}
            editSubmitting={handlers.editSubmittingId === comment._id}
            onRequestDelete={() => handlers.onRequestDelete(comment._id)}
            isReplying={handlers.replyingTo === comment._id}
            replyValue={handlers.replyValues[comment._id] || ""}
            onReplyValueChange={(value) => handlers.onReplyValueChange(comment._id, value)}
            onStartReply={() => handlers.onStartReply(comment._id)}
            onCancelReply={handlers.onCancelReply}
            onSubmitReply={() => handlers.onSubmitReply(comment._id)}
            replySubmitting={handlers.replySubmittingId === comment._id}
          >
            {hasReplies && (
              <div className={level === 0 ? "ml-6" : ""}>
                <CommentThread
                  parentKey={comment._id}
                  level={level + 1}
                  commentsByParent={commentsByParent}
                  commentsById={commentsById}
                  {...handlers}
                />
              </div>
            )}
          </CommentItem>
        );
      })}
    </div>
  );
}
