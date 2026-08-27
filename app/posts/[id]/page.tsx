"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import GroundedEvidencePanel from "@/components/GroundedEvidencePanel";
import ModerationReasonList from "@/components/ModerationReasonList";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";
import VerificationBadge from "@/components/VerificationBadge";
import { getErrorMessage } from "@/lib/apiClient";
import { getExpertReviewReasons } from "@/lib/expertReview";
import { getAiLabelTone, getDisplayedAiLabel, shouldShowRawTrustStatus } from "@/lib/trustPresentation";

type Author = {
  _id: string;
  username: string;
  reputation: number;
  avatarUrl?: string;
};

type Comment = {
  _id: string;
  content: string;
  createdAt: string;
  parentComment?: string | null;
  isDeleted?: boolean;
  author: Author;
};

type Post = {
  _id: string;
  content: string;
  status: string;
  aiLabel: string;
  accurateVotes: number;
  inaccurateVotes: number;
  accurateWeight?: number;
  inaccurateWeight?: number;
  finalized: boolean;
  createdAt: string;
  author: Author;
  hashtags?: string[];
  needsExpertReview?: boolean;
  expertDecision?: string;
  aiRiskScore?: number;
  verificationScore?: number;
  moderationReasons?: string[];
  groundingStatus?: "not_checked" | "checked" | "insufficient_evidence";
  groundingSummary?: string;
  groundingSources?: Array<{
    title: string;
    url: string;
    domain: string;
    stance: "supports" | "contradicts" | "context" | "unknown";
  }>;
  groundingConfidence?: number;
  contradictionCount?: number;
  supportCount?: number;
  trustDecisionVersion?: number;
  trustEvaluationState?: string;
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

  const displayedAiLabel = post ? getDisplayedAiLabel(post) : "safe";

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
        <div className="vv-card p-5 sm:p-6 mb-6">
          <div className="mb-3 flex items-center gap-3">
            {post.author?.avatarUrl ? (
              <Image
                src={post.author.avatarUrl}
                alt={post.author.username}
                width={40}
                height={40}
                unoptimized
                className="w-10 h-10 rounded-full object-cover border"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
                {post.author?.username?.slice(0, 1)?.toUpperCase()}
              </div>
            )}

            <div>
              <p className="font-semibold">{post.author?.username}</p>
              <p className="vv-subtitle">Reputation: {post.author?.reputation}</p>
            </div>
          </div>


          <div className="text-xs text-slate-500 mb-2">
            Trust Version: {post.trustDecisionVersion} • State: {post.trustEvaluationState}
          </div>
          <p className="mb-4">{post.content}</p>

          {(post.hashtags || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {(post.hashtags || []).map((tag) => (
                <button
                  key={tag}
                  onClick={() => router.push(`/topics/${tag}`)}
                  className="vv-pill-blue"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="vv-post-stat-grid">
            <div className="vv-post-panel">
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-[0.18em]">Decision State</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {shouldShowRawTrustStatus(post.status) && <span className="vv-pill-gray">{post.status}</span>}

                {/* Primary trust verdict - synthesis of expert decision, evidence, and status */}
                <TrustVerdictBadge
                  status={post.status}
                  expertDecision={post.expertDecision}
                  verificationScore={post.verificationScore}
                  contradictionCount={post.contradictionCount}
                  groundingSources={post.groundingSources}
                />

                {/* Secondary - moderation risk label, kept visually subordinate */}
                <span className={`vv-verdict-pill vv-verdict-${getAiLabelTone(displayedAiLabel)}`}>
                  AI: {displayedAiLabel.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Evidence strength:</span>
                <VerificationBadge score={post.verificationScore} showScore={true} />
              </div>
              <p className="text-sm text-slate-700">Risk Score: {Number(post.aiRiskScore || 0)}</p>
              <p className="text-sm text-slate-700 mt-1">
                {post.finalized ? "Finalized" : "Open for voting"}
              </p>
            </div>

            <div className="vv-post-panel-accent">
              <p className="text-xs text-slate-500 mb-2 uppercase tracking-[0.18em]">Review Context</p>
              <p className="text-sm text-slate-700">Accurate Votes: {post.accurateVotes}</p>
              <p className="text-sm text-slate-700 mt-1">Inaccurate Votes: {post.inaccurateVotes}</p>
              {post.expertDecision && (
                <p className="text-sm text-veriverse-purple mt-2">Expert Decision: {post.expertDecision}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4">
            <div className="space-y-4">
              {Array.isArray(post.moderationReasons) && post.moderationReasons.length > 0 && (
                <div className="vv-post-panel-accent">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900 mb-3">
                    Moderation Signals
                  </p>
                  <ModerationReasonList
                    reasons={post.moderationReasons}
                    className="mb-0"
                    sourceLimit={0}
                  />
                </div>
              )}

              {post.needsExpertReview && (
                <div className="vv-post-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 mb-2">
                    Expert Review Required
                  </p>
                  <p className="text-xs text-slate-500 leading-6">
                    {getExpertReviewReasons(
                      post.content,
                      post.hashtags || [],
                      Number(post.aiRiskScore || 0),
                      post.groundingStatus || "not_checked",
                      post.groundingSources || []
                    ).join("; ") || "Sensitive content requires a human check."}
                  </p>
                  {displayedAiLabel === "safe" && (
                    <p className="text-xs text-slate-500 mt-2 leading-6">
                      AI safe means the model saw low misinformation risk. Expert review is a separate escalation path for sensitive topics.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <GroundedEvidencePanel
                groundingStatus={post.groundingStatus}
                groundingSummary={post.groundingSummary}
                groundingSources={post.groundingSources}
                groundingConfidence={post.groundingConfidence}
                contradictionCount={post.contradictionCount}
                supportCount={post.supportCount}
                verificationScore={post.verificationScore}
              />
            </div>
          </div>
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