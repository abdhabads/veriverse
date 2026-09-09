// components/PostCard.tsx
// Extracted from the previously monolithic app/feed/page.tsx per-post render
// block (P0-A). Presentation-only: app/feed/page.tsx remains the owner of
// feed-level state and API coordination - this component reads slices of
// that state via props and calls back through the same handler functions
// that already existed in the parent, unchanged.
"use client";

import Image from "next/image";
import Link from "next/link";
import GroundedEvidencePanel from "@/components/GroundedEvidencePanel";
import TrustSummaryLine from "@/components/TrustSummaryLine";
import ActionIcon from "@/components/ActionIcons";

export type User = {
  _id: string;
  id?: string;
  username: string;
  email?: string;
  reputation?: number;
  rewardPoints?: number;
  role?: string;
  avatarUrl?: string;
  badges?: string[];
};

export type GroundingSource = {
  title: string;
  url: string;
  domain: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
};

export type EvidenceAssessment = {
  supportStrength?: "none" | "weak" | "moderate" | "strong";
  contradictionStrength?: "none" | "weak" | "moderate" | "strong";
  independentSupportingCount?: number;
  independentContradictingCount?: number;
  explanation?: string;
};

export type Comment = {
  _id: string;
  author: User;
  content: string;
  createdAt?: string;
};

export type Post = {
  _id: string;
  author: User;
  content: string;
  status:
    | "unverified"
    | "verified"
    | "false"
    | "disputed"
    | "flagged"
    | "under_expert_review"
    | "under_appeal_review";
  aiLabel?: "safe" | "suspicious" | "needs_review" | "high_risk";
  aiRiskScore?: number;
  verificationScore?: number;
  moderationReasons?: string[];
  hashtags?: string[];
  likesCount?: number;
  repostsCount?: number;
  accurateVotes?: number;
  inaccurateVotes?: number;
  accurateWeight?: number;
  inaccurateWeight?: number;
  finalized?: boolean;
  trustDecisionVersion?: number;
  trustEvaluationState?: "pending" | "evaluated" | "finalized" | "reopened";
  groundingStatus?: "not_checked" | "checked" | "insufficient_evidence";
  groundingSummary?: string;
  groundingSources?: GroundingSource[];
  groundingConfidence?: number;
  contradictionCount?: number;
  supportCount?: number;
  evidenceAssessment?: EvidenceAssessment;
  contentType?: "claim" | "question" | "instruction" | "rhetorical_claim";
  needsExpertReview?: boolean;
  expertDecision?: string;
  hasActiveAppeal?: boolean;
  appealCount?: number;
  createdAt?: string;
};

function formatRelativeTime(createdAt?: string) {
  if (!createdAt) {
    return "Just now";
  }

  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(createdAt).toLocaleDateString();
}

function getFeedCategory(post: Post) {
  if (post.hashtags?.length) {
    return `#${post.hashtags[0]}`;
  }

  return post.status.replaceAll("_", " ");
}

// "Comments" (no number) when the list genuinely hasn't been fetched yet -
// showing "0 comments" in that case would misrepresent unknown as zero.
// Once fetched, an empty array is a real, confirmed zero.
export function formatCommentCountLabel(comments?: Comment[]): string {
  if (!comments) return "Comments";
  const count = comments.length;
  if (count === 0) return "No comments yet";
  if (count === 1) return "1 comment";
  return `${count} comments`;
}

type PostCardProps = {
  post: Post;
  currentUser: User | null;
  currentUserId?: string;

  // Editing (parent-owned - only one post editable at a time, matching
  // existing behavior exactly).
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (value: string) => void;
  onStartEdit: (postId: string, existingContent: string) => void;
  onSaveEdit: (postId: string) => void;
  onCancelEdit: () => void;

  // Evidence disclosure toggle (parent-owned).
  isEvidenceExpanded: boolean;
  onToggleEvidence: (postId: string) => void;

  // Voting / social actions.
  onVote: (postId: string, voteType: "accurate" | "inaccurate") => void;
  onRepost: (postId: string) => void;
  onSave: (postId: string) => void;
  isSaved: boolean;

  // Moderation / management.
  onDelete: (postId: string) => void;
  onFollow: (userId: string) => void;
  onToggleRelation: (userId: string, relationType: "block" | "mute") => void;
  isFollowing: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  onReport: (postId: string) => void;
  reportReason: string;
  onReportReasonChange: (postId: string, reason: string) => void;

  // Comments (desktop: inline expand/collapse; mobile: routes to detail page).
  isCommentsExpanded: boolean;
  onToggleComments: (postId: string) => void;
  comments: Comment[] | undefined;
  commentInput: string;
  onCommentInputChange: (postId: string, value: string) => void;
  onAddComment: (postId: string) => void;
  onLoadComments: (postId: string) => void;

  // Navigation.
  onNavigateToProfile: (username: string) => void;
};

export default function PostCard({
  post,
  currentUser,
  currentUserId,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  isEvidenceExpanded,
  onToggleEvidence,
  onVote,
  onRepost,
  onSave,
  isSaved,
  onDelete,
  onFollow,
  onToggleRelation,
  isFollowing,
  isMuted,
  isBlocked,
  onReport,
  reportReason,
  onReportReasonChange,
  isCommentsExpanded,
  onToggleComments,
  comments,
  commentInput,
  onCommentInputChange,
  onAddComment,
  onLoadComments,
  onNavigateToProfile,
}: PostCardProps) {
  return (
    <div data-testid="post-card" className="vv-card p-5 sm:p-6">
      <div className="vv-post-panel p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {post.author?.avatarUrl ? (
              <Image
                src={post.author.avatarUrl}
                alt={post.author.username}
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-veriverse-border bg-white/70 text-xs text-slate-500">
                {post.author?.username?.slice(0, 1)?.toUpperCase()}
              </div>
            )}

            <div>
              <button
                onClick={() => onNavigateToProfile(post.author?.username)}
                className="font-semibold text-left hover:underline text-veriverse-dark"
              >
                {post.author?.username}
              </button>
              <p className="text-xs text-slate-500">
                {formatRelativeTime(post.createdAt)} · {getFeedCategory(post)}
              </p>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="mb-4">
            <textarea
              className="vv-textarea mb-2"
              rows={3}
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => onSaveEdit(post._id)} className="vv-btn-primary">
                Save
              </button>
              <button onClick={onCancelEdit} className="vv-btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-800 mb-4 text-[15px] leading-7 sm:text-base">
            {post.content}
          </p>
        )}

        <TrustSummaryLine
          status={post.status}
          expertDecision={post.expertDecision}
          verificationScore={post.verificationScore}
          contradictionCount={post.contradictionCount}
          supportCount={post.supportCount}
          groundingSources={post.groundingSources}
          groundingStatus={post.groundingStatus}
          contentType={post.contentType}
        />

        <button
          type="button"
          onClick={() => onToggleEvidence(post._id)}
          aria-expanded={isEvidenceExpanded}
          aria-controls={`evidence-panel-${post._id}`}
          className="mt-4 w-full rounded-[24px] border border-veriverse-border bg-white/60 px-4 py-3 text-left transition hover:bg-white"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-veriverse-dark">
              Why this assessment?
            </span>
            <ActionIcon
              name="chevronDown"
              className={`text-veriverse-dark/50 transition-transform ${
                isEvidenceExpanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {isEvidenceExpanded && (
          <div id={`evidence-panel-${post._id}`} className="mt-2">
            <GroundedEvidencePanel
              groundingStatus={post.groundingStatus}
              groundingSummary={post.groundingSummary}
              groundingSources={post.groundingSources}
              groundingConfidence={post.groundingConfidence}
              contradictionCount={post.contradictionCount}
              supportCount={post.supportCount}
              evidenceAssessment={post.evidenceAssessment}
              verificationScore={post.verificationScore}
              maxSources={3}
              compact
            />
          </div>
        )}

        <Link
          href={`/posts/${post._id}`}
          className="vv-link-accent mt-3 inline-flex text-xs font-medium"
        >
          View full analysis &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-3 mb-4">
        {(currentUser?.role === "user" || currentUser?.role === "expert") && (
          <div className="vv-post-action-cluster">
            <p className="vv-post-action-title">Engage With This Claim</p>
            <div className="vv-post-action-grid">
              <button
                onClick={() => onVote(post._id, "accurate")}
                disabled={post.finalized}
                aria-label={`Endorse post by ${post.author?.username}`}
                aria-disabled={post.finalized}
                className="vv-post-action-button vv-post-action-strong"
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="thumbsUp" />
                  Endorse
                </span>
                <span>{post.accurateVotes}</span>
              </button>
              <button
                onClick={() => onVote(post._id, "inaccurate")}
                disabled={post.finalized}
                aria-label={`Oppose post by ${post.author?.username}`}
                aria-disabled={post.finalized}
                className="vv-post-action-button vv-post-action-warn"
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="thumbsDown" />
                  Oppose
                </span>
                <span>{post.inaccurateVotes}</span>
              </button>
              <button
                onClick={() => onRepost(post._id)}
                className="vv-post-action-button"
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="repost" />
                  Repost
                </span>
                <span>{post.repostsCount || 0}</span>
              </button>
              <button
                onClick={() => onSave(post._id)}
                className="vv-post-action-button"
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name={isSaved ? "bookmarkFilled" : "bookmark"} />
                  {isSaved ? "Saved" : "Save"}
                </span>
              </button>
            </div>
          </div>
        )}

        {(currentUser?.role === "admin" ||
          currentUser?.role === "expert" ||
          currentUserId === post.author?._id) && (
          <div className="vv-post-action-cluster">
            <p className="vv-post-action-title">Moderate And Manage</p>
            <div className="space-y-3">
              {currentUserId === post.author?._id && !post.finalized && (
                <div className="vv-post-action-grid xl:grid-cols-2">
                  <button
                    onClick={() => onStartEdit(post._id, post.content)}
                    className="vv-post-action-button"
                  >
                    <span className="flex items-center gap-1.5">
                      <ActionIcon name="pencil" />
                      Edit
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Are you sure you want to delete this post?"
                      );
                      if (confirmed) onDelete(post._id);
                    }}
                    className="vv-post-action-button vv-post-action-warn"
                  >
                    <span className="flex items-center gap-1.5">
                      <ActionIcon name="trash" />
                      Delete
                    </span>
                  </button>
                </div>
              )}
              {currentUserId !== post.author?._id &&
                (currentUser?.role === "admin" || currentUser?.role === "expert") && (
                <>
                  <div className="vv-post-action-grid xl:grid-cols-2">
                    <button
                      onClick={() => onFollow(post.author._id)}
                      className="vv-post-action-button"
                    >
                      <span className="flex items-center gap-1.5">
                        <ActionIcon name={isFollowing ? "userCheck" : "userPlus"} />
                        {isFollowing ? "Following" : "Follow"}
                      </span>
                    </button>
                    <button
                      onClick={() => onToggleRelation(post.author._id, "mute")}
                      className="vv-post-action-button"
                    >
                      <span className="flex items-center gap-1.5">
                        <ActionIcon name={isMuted ? "unmute" : "mute"} />
                        {isMuted ? "Unmute" : "Mute"}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        const confirmed = isBlocked
                          ? true
                          : window.confirm(
                              "Block this user and hide their posts from your feed?"
                            );
                        if (confirmed) onToggleRelation(post.author._id, "block");
                      }}
                      className="vv-post-action-button vv-post-action-warn"
                    >
                      <span className="flex items-center gap-1.5">
                        <ActionIcon name="shieldOff" />
                        {isBlocked ? "Unblock" : "Block"}
                      </span>
                    </button>
                    <button
                      onClick={() => onReport(post._id)}
                      className="vv-post-action-button vv-post-action-warn"
                    >
                      <span className="flex items-center gap-1.5">
                        <ActionIcon name="flag" />
                        Report
                      </span>
                    </button>
                  </div>
                  <select
                    className="vv-select w-full"
                    value={reportReason || "other"}
                    onChange={(e) => onReportReasonChange(post._id, e.target.value)}
                  >
                    <option value="misinformation">Misinformation</option>
                    <option value="spam">Spam</option>
                    <option value="abuse">Abuse</option>
                    <option value="other">Other</option>
                  </select>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="vv-divider pt-4">
        {/* Mobile: routes to the detail page's full threaded-comment view
            instead of expanding the feed comment UI inline. Desktop: toggles
            the inline panel below. Both read the same count label. */}
        <Link
          href={`/posts/${post._id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-veriverse-dark sm:hidden"
        >
          <span aria-hidden="true">💬</span>
          {formatCommentCountLabel(comments)}
        </Link>

        <button
          type="button"
          onClick={() => onToggleComments(post._id)}
          aria-expanded={isCommentsExpanded}
          aria-controls={`comments-panel-${post._id}`}
          className="hidden items-center gap-1.5 text-sm text-slate-600 transition hover:text-veriverse-dark sm:inline-flex"
        >
          <span aria-hidden="true">💬</span>
          {formatCommentCountLabel(comments)}
        </button>

        {isCommentsExpanded && (
          <div id={`comments-panel-${post._id}`} className="mt-3 hidden sm:block">
            <div className="vv-post-comment-shell">
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  className="vv-input flex-1"
                  placeholder="Add a comment"
                  aria-label={`Add a comment to post by ${post.author?.username}`}
                  value={commentInput}
                  onChange={(e) => onCommentInputChange(post._id, e.target.value)}
                />
                <button onClick={() => onAddComment(post._id)} className="vv-btn-accent">
                  Send
                </button>
              </div>

              <div className="space-y-3">
                {!comments ? (
                  <button
                    onClick={() => onLoadComments(post._id)}
                    className="vv-btn-secondary"
                  >
                    Load Comments
                  </button>
                ) : (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div key={comment._id} className="vv-post-comment-thread">
                        <p className="text-sm font-medium text-veriverse-dark mb-1">
                          {comment.author?.username}
                        </p>
                        <p className="text-sm text-slate-700 leading-6">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{post.finalized ? "Finalized" : "Open for voting"}</span>
        <span>
          {post.createdAt ? new Date(post.createdAt).toLocaleString() : "Unknown time"}
        </span>
      </div>
    </div>
  );
}
