"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import PageWrapper from "@/components/PageWrapper";
import ReputationInfo from "@/components/ReputationInfo";
import Toast from "@/components/Toast";
import PostCard, { type Post, type User as Author } from "@/components/PostCard";
import { getErrorMessage } from "@/lib/apiClient";

// Reuses PostCard's own Post/User types rather than maintaining a second,
// diverging definition (the previous local type declared status/aiLabel as
// plain `string`, which is exactly the kind of page-specific looseness this
// consolidation removes).
type Comment = {
  _id: string;
  content: string;
  createdAt: string;
  parentComment?: string | null;
  isDeleted?: boolean;
  author: Author;
};

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [message, setMessage] = useState("");

  const [newComment, setNewComment] = useState("");
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

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
      const resolvedParams = await params;
      const res = await axios.get(`/api/posts/${resolvedParams.id}/detail`);
      setPost(res.data.post);
      setComments(res.data.comments || []);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to load post"));
    }
  }, [params]);

  async function addComment(parentComment?: string | null) {
    try {
      const resolvedParams = await params;
      const content = parentComment ? replyMap[parentComment] : newComment;

      if (!content?.trim()) return;

      await axios.post(
        `/api/posts/${resolvedParams.id}/comments`,
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

      fetchDetail();
      setMessage("Comment posted");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to add comment"));
    }
  }

  async function votePost(voteType: "accurate" | "inaccurate") {
    if (!post) return;

    try {
      const resolvedParams = await params;
      const res = await axios.post(
        `/api/posts/${resolvedParams.id}/vote`,
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

  async function updateComment(commentId: string) {
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
      fetchDetail();
      setMessage("Comment updated");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to update comment"));
    }
  }

  async function deleteComment(commentId: string) {
    try {
      await axios.delete(`/api/comments/${commentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      fetchDetail();
      setMessage("Comment deleted");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to delete comment"));
    }
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

  useEffect(() => {
    const run = async () => {
      await fetchDetail();
    };

    void run();
  }, [fetchDetail]);

  const renderComments = (parentKey: string = "root", level = 0) => {
    const items = commentsByParent[parentKey] || [];

    return items.map((comment) => {
      const canEdit =
        currentUser &&
        (currentUser.id === comment.author?._id || currentUser.role === "admin");

      return (
        <div
          key={comment._id}
          className={`vv-post-comment-thread ${level > 0 ? "ml-6 mt-3" : "mb-3"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
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

              <div>
                <p className="text-sm font-medium">{comment.author?.username}</p>
                <p className="text-xs text-slate-500">
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {canEdit && !comment.isDeleted && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingCommentId(comment._id);
                    setEditCommentText(comment.content);
                  }}
                  className="vv-btn-secondary text-xs px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteComment(comment._id)}
                  className="vv-btn-danger text-xs px-2 py-1"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {editingCommentId === comment._id ? (
            <div className="mt-3">
              <textarea
                className="vv-textarea mb-2"
                rows={3}
                value={editCommentText}
                onChange={(e) => setEditCommentText(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => updateComment(comment._id)}
                  className="vv-btn-primary"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingCommentId(null);
                    setEditCommentText("");
                  }}
                  className="vv-btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-700 mt-3">{comment.content}</p>
          )}

          {!comment.isDeleted && (
            <div className="mt-3">
              <button
                onClick={() =>
                  setReplyingTo((prev) => (prev === comment._id ? null : comment._id))
                }
                className="vv-btn-secondary text-xs"
              >
                Reply
              </button>

              {replyingTo === comment._id && (
                <div className="mt-3">
                  <textarea
                    className="vv-textarea mb-2"
                    rows={2}
                    placeholder={`Reply to ${comment.author?.username}...`}
                    value={replyMap[comment._id] || ""}
                    onChange={(e) =>
                      setReplyMap((prev) => ({
                        ...prev,
                        [comment._id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    onClick={() => addComment(comment._id)}
                    className="vv-btn-primary"
                  >
                    Send Reply
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-3">{renderComments(comment._id, level + 1)}</div>
        </div>
      );
    });
  };

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

        <div className="vv-post-comment-shell">
          <textarea
            className="vv-textarea mb-3"
            rows={3}
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />

          <button onClick={() => addComment()} className="vv-btn-primary">
            Post Comment
          </button>
        </div>
      </div>

      <div className="vv-card p-5">
        <h3 className="vv-section-title mb-4">Discussion</h3>

        {comments.length === 0 ? (
          <EmptyState
            title="No comments yet"
            description="Start the thread with a first response or clarification."
          />
        ) : (
          <div>{renderComments()}</div>
        )}
      </div>
    </PageWrapper>
  );
}