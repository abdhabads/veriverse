"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import PageWrapper from "@/components/PageWrapper";
import ReputationInfo from "@/components/ReputationInfo";
import Toast from "@/components/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PostCard, { type Post } from "@/components/PostCard";
import CommentComposer from "@/components/CommentComposer";
import CommentThread, { type Comment } from "@/components/CommentThread";
import { getErrorMessage } from "@/lib/apiClient";

export default function PostPageClient({ id }: { id: string }) {
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [message, setMessage] = useState("");

  const [newComment, setNewComment] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replySubmittingId, setReplySubmittingId] = useState<string | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [editSubmittingId, setEditSubmittingId] = useState<string | null>(null);

  const [commentPendingDeleteId, setCommentPendingDeleteId] = useState<string | null>(null);

  const [reportReason, setReportReason] = useState("other");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const currentUser =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("user") || "null")
      : null;

  const fetchDetail = useCallback(async () => {
    try {
      const res = await axios.get(`/api/posts/${id}/detail`);
      setPost(res.data.post);
      setComments(res.data.comments || []);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to load post"));
    }
  }, [id]);

  async function addComment(parentComment?: string | null) {
    const content = parentComment ? replyMap[parentComment] : newComment;
    if (!content?.trim()) return;

    const busy = parentComment ? replySubmittingId === parentComment : commentSubmitting;
    if (busy) return;

    if (parentComment) setReplySubmittingId(parentComment);
    else setCommentSubmitting(true);

    try {
      await axios.post(
        `/api/posts/${id}/comments`,
        {
          content,
          parentComment: parentComment || null,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (parentComment) {
        setReplyMap((prev) => ({ ...prev, [parentComment]: "" }));
        setReplyingTo(null);
      } else {
        setNewComment("");
      }

      await fetchDetail();
      setMessage("Comment posted");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to add comment"));
    } finally {
      if (parentComment) setReplySubmittingId(null);
      else setCommentSubmitting(false);
    }
  }

  async function votePost(voteType: "accurate" | "inaccurate") {
    if (!post) return;

    try {
      const res = await axios.post(
        `/api/posts/${id}/vote`,
        { voteType },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setPost((prev) => (prev ? { ...prev, ...res.data.post } : prev));
      setMessage(res.data.message || "Vote recorded.");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to record vote"));
    }
  }

  async function submitReport() {
    if (!post || reportSubmitting) return;

    setReportSubmitting(true);

    try {
      const res = await axios.post(
        "/api/reports",
        { postId: post._id, reason: reportReason },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage(res.data.message || "Report submitted.");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to submit report"));
    } finally {
      setReportSubmitting(false);
    }
  }

  function startEditComment(commentId: string, existingContent: string) {
    setEditingCommentId(commentId);
    setEditCommentText(existingContent);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditCommentText("");
  }

  async function saveEditComment(commentId: string) {
    if (editSubmittingId === commentId || !editCommentText.trim()) return;
    setEditSubmittingId(commentId);

    try {
      await axios.patch(
        `/api/comments/${commentId}`,
        { content: editCommentText },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setEditingCommentId(null);
      setEditCommentText("");
      await fetchDetail();
      setMessage("Comment updated");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to update comment"));
    } finally {
      setEditSubmittingId(null);
    }
  }

  async function confirmDeleteComment() {
    const commentId = commentPendingDeleteId;
    if (!commentId) return;

    try {
      await axios.delete(`/api/comments/${commentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      await fetchDetail();
      setMessage("Comment deleted");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to delete comment"));
    } finally {
      setCommentPendingDeleteId(null);
    }
  }

  function startReply(commentId: string) {
    setReplyingTo((prev) => (prev === commentId ? null : commentId));
  }

  function cancelReply() {
    setReplyingTo(null);
  }

  const commentsByParent = useMemo(() => {
    const grouped: Record<string, Comment[]> = {};
    for (const comment of comments) {
      const key = comment.parentComment || "root";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(comment);
    }
    return grouped;
  }, [comments]);

  const commentsById = useMemo(() => {
    const byId: Record<string, Comment> = {};
    for (const comment of comments) {
      byId[comment._id] = comment;
    }
    return byId;
  }, [comments]);

  useEffect(() => {
    const run = async () => {
      await fetchDetail();
    };

    void run();
  }, [fetchDetail]);

  return (
    <PageWrapper
      title="Post Detail"
      subtitle="Review the full analysis, grounded evidence links, and discussion thread."
    >
      <div className="vv-action-row mb-4">
        <button onClick={() => router.push("/feed")} className="vv-btn-secondary">
          Back to Feed
        </button>
      </div>

      {message && <Toast message={message} type="info" />}

      {post ? (
        <div className="mb-6">
          {/* Author reputation stays page-owned, non-actionable context -
              PostCard's shared author row doesn't carry this, so it's kept
              here rather than added to every surface that reuses PostCard. */}
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span>User reputation: {post.author?.reputation}</span>
            <ReputationInfo />
          </div>

          {(post.hashtags || []).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {(post.hashtags || []).map((tag) => (
                <button key={tag} onClick={() => router.push(`/topics/${tag}`)} className="vv-pill-blue">
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <PostCard
            variant="detail"
            post={post}
            currentUser={currentUser}
            currentUserId={currentUser?.id || currentUser?._id}
            onVote={(_postId, voteType) => votePost(voteType)}
            onReport={currentUser && currentUser.id !== post.author?._id ? () => submitReport() : undefined}
            reportReason={reportReason}
            onReportReasonChange={(_postId, reason) => setReportReason(reason)}
            comments={comments}
            onNavigateToProfile={(username) => router.push(`/u/${username}`)}
          />
        </div>
      ) : null}

      <div className="vv-card p-5 mb-6">
        <h3 className="vv-section-title mb-4">Add Comment</h3>

        <CommentComposer
          value={newComment}
          onChange={setNewComment}
          onSubmit={() => addComment()}
          submitting={commentSubmitting}
        />
      </div>

      <div className="vv-card p-5">
        <h3 className="vv-section-title mb-4">Discussion</h3>

        {comments.length === 0 ? (
          <EmptyState
            title="No comments yet"
            description="Start the thread with a first response or clarification."
          />
        ) : (
          <CommentThread
            parentKey="root"
            level={0}
            commentsByParent={commentsByParent}
            commentsById={commentsById}
            currentUserId={currentUser?.id || currentUser?._id}
            isAdmin={currentUser?.role === "admin"}
            editingCommentId={editingCommentId}
            editContent={editCommentText}
            onEditContentChange={setEditCommentText}
            onStartEdit={startEditComment}
            onSaveEdit={saveEditComment}
            onCancelEdit={cancelEditComment}
            editSubmittingId={editSubmittingId}
            onRequestDelete={setCommentPendingDeleteId}
            replyingTo={replyingTo}
            replyValues={replyMap}
            onReplyValueChange={(commentId, value) =>
              setReplyMap((prev) => ({ ...prev, [commentId]: value }))
            }
            onStartReply={startReply}
            onCancelReply={cancelReply}
            onSubmitReply={(commentId) => addComment(commentId)}
            replySubmittingId={replySubmittingId}
          />
        )}
      </div>

      <ConfirmDialog
        open={commentPendingDeleteId !== null}
        title="Delete this comment?"
        description="This removes the comment's content. Replies may remain in the discussion."
        confirmLabel="Delete"
        destructive
        onCancel={() => setCommentPendingDeleteId(null)}
        onConfirm={confirmDeleteComment}
      />
    </PageWrapper>
  );
}
