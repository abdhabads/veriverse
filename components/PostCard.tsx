// components/PostCard.tsx
// Shared post presentation (P2.3). Originally extracted from the feed's own
// per-post render block (P0-A) and used only by app/feed/page.tsx; as of
// P2.3 it also backs the post-detail page's post header, and the
// profile-compact post rows on own/public profile - replacing three
// previously-independent, divergent renderers. `variant` controls which of
// those three presentations is used; everything else about the ownership
// model is unchanged - the parent page still owns state/API coordination,
// this component reads props and calls back through parent-supplied
// handlers, all now optional so a page only needs to wire up the actions it
// actually supports.
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import GroundedEvidencePanel from "@/components/GroundedEvidencePanel";
import TrustSummaryLine from "@/components/TrustSummaryLine";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";
import VerificationBadge from "@/components/VerificationBadge";
import ModerationReasonList from "@/components/ModerationReasonList";
import ActionIcon from "@/components/ActionIcons";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PostProvenanceDetails from "@/components/PostProvenanceDetails";
import { sharePost } from "@/lib/shareLink";
import { getDisplayedAiLabel } from "@/lib/trustPresentation";
import { getExpertReviewReasons } from "@/lib/expertReview";

// P2.4: detail's verdict presentation now uses the same canonical
// TrustVerdictBadge as feed/profile-compact (via getTrustVerdict()), plus
// VerificationBadge repurposed as a secondary "Evidence strength" signal
// that self-hides whenever the verdict wasn't score-driven - see
// lib/trustPresentation.ts's getEvidenceStrength() for why that structurally
// prevents the "Expert Rejected" + "Strong Evidence" drift the P2.4 audit
// found. The raw post.status pill and the equal-weight "AI: {label}" pill
// that previously sat alongside the verdict are gone from this glance
// layer - AI screening context moved into PostProvenanceDetails (Level 4),
// which also absorbs "Expert Review Required". "Moderation Signals" stays
// unconditionally visible (not folded into Details) because it carries
// concrete safety-relevant reason tags, not just process/provenance context.

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

export type PostCardVariant = "feed" | "detail" | "profile-compact";

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

const FOCUS_RING =
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e85d3f]";

type PostCardProps = {
  post: Post;
  currentUser: User | null;
  currentUserId?: string;
  variant?: PostCardVariant;

  // Editing (own-post only; optional - pages that don't support inline
  // edit for this variant simply omit these props and no Edit control
  // renders).
  isEditing?: boolean;
  editContent?: string;
  onEditContentChange?: (value: string) => void;
  onStartEdit?: (postId: string, existingContent: string) => void;
  onSaveEdit?: (postId: string) => void;
  onCancelEdit?: () => void;

  // Evidence disclosure. Only consulted for variant="feed" (progressive,
  // compact); "detail" always renders the full panel unconditionally;
  // "profile-compact" renders no evidence panel at all. If the parent
  // doesn't pass isEvidenceExpanded/onToggleEvidence, feed manages its own
  // internal expand/collapse state instead of requiring every caller to.
  isEvidenceExpanded?: boolean;
  onToggleEvidence?: (postId: string) => void;

  // Voting / social actions - all optional; omitted handler = control not
  // rendered, never a broken button.
  onVote?: (postId: string, voteType: "accurate" | "inaccurate") => void;
  onRepost?: (postId: string) => void;
  onSave?: (postId: string) => void;
  isSaved?: boolean;

  // Moderation / management - all optional, same rule.
  onDelete?: (postId: string) => void;
  onFollow?: (userId: string) => void;
  onToggleRelation?: (userId: string, relationType: "block" | "mute") => void;
  isFollowing?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
  onReport?: (postId: string) => void;
  reportReason?: string;
  onReportReasonChange?: (postId: string, reason: string) => void;

  // Comments. variant="feed": existing dual mobile-link/desktop-toggle
  // inline panel, parent-controlled exactly as before. variant="detail":
  // a static (non-interactive) count - the real thread lives below on the
  // same page, owned entirely by that page, untouched by this component.
  // variant="profile-compact": no comment affordance here at all - the
  // "View full analysis" link is the route to the real thread.
  isCommentsExpanded?: boolean;
  onToggleComments?: (postId: string) => void;
  comments?: Comment[];
  commentInput?: string;
  onCommentInputChange?: (postId: string, value: string) => void;
  onAddComment?: (postId: string) => void;
  onLoadComments?: (postId: string) => void;

  // Navigation.
  onNavigateToProfile?: (username: string) => void;
};

// Small, local disclosure for secondary/overflow actions. Deliberately not
// imported from components/shell/ProfileMenu - same interaction discipline
// (click/outside-click/Escape/focus-return, aria-haspopup+aria-expanded),
// but PostCard stays independent of the application shell entirely.
function PostOverflowMenu({
  postId,
  label,
  children,
}: {
  postId: string;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        aria-controls={`post-overflow-${postId}`}
        className={`vv-post-action-button ${FOCUS_RING}`}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">&#8943;</span>
          <span className="hidden sm:inline">More</span>
        </span>
      </button>

      {open && (
        <div
          id={`post-overflow-${postId}`}
          ref={panelRef}
          role="menu"
          aria-label={label}
          className="vv-post-menu-panel absolute right-0 top-full z-10 mt-2 w-64"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function PostCard({
  post,
  currentUser,
  currentUserId,
  variant = "feed",
  isEditing = false,
  editContent = "",
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  isEvidenceExpanded: isEvidenceExpandedProp,
  onToggleEvidence,
  onVote,
  onRepost,
  onSave,
  isSaved = false,
  onDelete,
  onFollow,
  onToggleRelation,
  isFollowing = false,
  isMuted = false,
  isBlocked = false,
  onReport,
  reportReason = "other",
  onReportReasonChange,
  isCommentsExpanded = false,
  onToggleComments,
  comments,
  commentInput = "",
  onCommentInputChange,
  onAddComment,
  onLoadComments,
  onNavigateToProfile,
}: PostCardProps) {
  const [shareFeedback, setShareFeedback] = useState("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [internalEvidenceExpanded, setInternalEvidenceExpanded] = useState(false);

  const isOwnPost = Boolean(currentUserId) && currentUserId === post.author?._id;
  const canEngage = currentUser?.role === "user" || currentUser?.role === "expert";
  const isEvidenceExpanded =
    variant === "detail" ? true : isEvidenceExpandedProp ?? internalEvidenceExpanded;

  const handleToggleEvidence = () => {
    if (onToggleEvidence) onToggleEvidence(post._id);
    else setInternalEvidenceExpanded((prev) => !prev);
  };

  const handleShare = async () => {
    setShareFeedback("");
    const result = await sharePost({
      postId: post._id,
      title: "VeriVerse post",
      text: "Take a look at this post on VeriVerse and see what the evidence says.",
    });

    if (result.status === "cancelled") return;
    if (result.message) setShareFeedback(result.message);
  };

  const displayedAiLabel = getDisplayedAiLabel(post);
  const expertReviewReasons =
    variant === "detail" && post.needsExpertReview
      ? getExpertReviewReasons(
          post.content,
          post.hashtags || [],
          Number(post.aiRiskScore || 0),
          post.groundingStatus || "not_checked",
          post.groundingSources || []
        )
      : [];

  // Repost/Share/Save keep the same role gate Endorse/Oppose already have
  // (canEngage) - they were part of the same role-gated "Engage" cluster
  // before this consolidation, and moving them into the shared overflow
  // must not quietly relax who can see them. Follow/Mute/Block/Report/
  // Delete were never role-gated (only ownership-gated), unchanged here.
  const canShare = canEngage;
  const hasOverflowContent =
    (canEngage && (Boolean(onRepost) || Boolean(onSave))) ||
    canShare ||
    (!isOwnPost && Boolean(onFollow)) ||
    (!isOwnPost && Boolean(onToggleRelation)) ||
    (!isOwnPost && Boolean(onReport)) ||
    (isOwnPost && Boolean(onDelete));

  return (
    <div data-testid="post-card" className="vv-card p-3 sm:p-4">
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
                onClick={() => onNavigateToProfile?.(post.author?.username)}
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
              onChange={(e) => onEditContentChange?.(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => onSaveEdit?.(post._id)} className="vv-btn-primary">
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

        {variant === "detail" ? (
          // One primary canonical verdict, plus Evidence strength as a
          // clearly secondary signal (self-hides when not useful - see
          // VerificationBadge). Same TrustVerdictBadge component feed and
          // profile-compact use, so this can never express a different
          // verdict than they would for identical claim data.
          <div className="vv-post-panel">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Verdict</p>
            <div className="mb-3">
              <TrustVerdictBadge
                status={post.status}
                expertDecision={post.expertDecision}
                verificationScore={post.verificationScore}
                contradictionCount={post.contradictionCount}
                groundingSources={post.groundingSources}
                contentType={post.contentType}
              />
            </div>
            <VerificationBadge
              status={post.status}
              expertDecision={post.expertDecision}
              verificationScore={post.verificationScore}
              contradictionCount={post.contradictionCount}
              groundingSources={post.groundingSources}
              contentType={post.contentType}
              showScore
            />
          </div>
        ) : (
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
        )}

        {variant !== "profile-compact" && (
          <>
            {variant === "feed" && (
              <button
                type="button"
                onClick={handleToggleEvidence}
                aria-expanded={isEvidenceExpanded}
                aria-controls={`evidence-panel-${post._id}`}
                className={`mt-4 w-full rounded-[24px] border border-veriverse-border bg-white/60 px-4 py-3 text-left transition hover:bg-white ${FOCUS_RING}`}
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
            )}

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
                  maxSources={variant === "detail" ? undefined : 3}
                  compact={variant !== "detail"}
                />
              </div>
            )}

            {variant === "detail" && Array.isArray(post.moderationReasons) && post.moderationReasons.length > 0 && (
              <div className="vv-post-panel-accent mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-900">
                  Moderation Signals
                </p>
                <ModerationReasonList reasons={post.moderationReasons} className="mb-0" sourceLimit={0} />
              </div>
            )}

            {variant === "detail" && (
              <PostProvenanceDetails
                postId={post._id}
                displayedAiLabel={displayedAiLabel}
                groundingStatus={post.groundingStatus}
                needsExpertReview={post.needsExpertReview}
                expertDecision={post.expertDecision}
                expertReviewReasons={expertReviewReasons}
              />
            )}
          </>
        )}

        {variant === "feed" && (
          <Link
            href={`/posts/${post._id}`}
            className="vv-link-accent mt-3 inline-flex text-xs font-medium"
          >
            View full analysis &rarr;
          </Link>
        )}
      </div>

      {variant !== "profile-compact" && (canEngage || Boolean(currentUser)) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {canEngage && onVote && (
            <>
              <button
                onClick={() => onVote(post._id, "accurate")}
                disabled={post.finalized}
                aria-label={`Endorse post by ${post.author?.username}`}
                aria-disabled={post.finalized}
                className={`vv-post-action-button vv-post-action-strong ${FOCUS_RING}`}
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="thumbsUp" />
                  <span className="hidden sm:inline">Endorse</span>
                </span>
                <span>{post.accurateVotes || 0}</span>
              </button>
              <button
                onClick={() => onVote(post._id, "inaccurate")}
                disabled={post.finalized}
                aria-label={`Oppose post by ${post.author?.username}`}
                aria-disabled={post.finalized}
                className={`vv-post-action-button vv-post-action-oppose ${FOCUS_RING}`}
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="thumbsDown" />
                  <span className="hidden sm:inline">Oppose</span>
                </span>
                <span>{post.inaccurateVotes || 0}</span>
              </button>
            </>
          )}

          {variant === "feed" && (
            <>
              <Link
                href={`/posts/${post._id}`}
                className={`vv-post-action-button sm:hidden ${FOCUS_RING}`}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true">💬</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onToggleComments?.(post._id)}
                aria-expanded={isCommentsExpanded}
                aria-controls={`comments-panel-${post._id}`}
                className={`vv-post-action-button hidden sm:inline-flex ${FOCUS_RING}`}
              >
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true">💬</span>
                  <span className="hidden sm:inline">{formatCommentCountLabel(comments)}</span>
                </span>
              </button>
            </>
          )}

          {variant === "detail" && (
            <span className={`vv-post-action-button vv-post-action-static`}>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">💬</span>
                <span className="hidden sm:inline">{formatCommentCountLabel(comments)}</span>
              </span>
            </span>
          )}

          {isOwnPost && onStartEdit && !post.finalized && (
            <button
              onClick={() => onStartEdit(post._id, post.content)}
              className={`vv-post-action-button ${FOCUS_RING}`}
            >
              <span className="flex items-center gap-1.5">
                <ActionIcon name="pencil" />
                <span className="hidden sm:inline">Edit</span>
              </span>
            </button>
          )}

          {hasOverflowContent && (
            <PostOverflowMenu postId={post._id} label={`More actions for post by ${post.author?.username}`}>
              {canEngage && onRepost && (
                <button
                  onClick={() => onRepost(post._id)}
                  className={`vv-post-menu-item w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name="repost" />
                  Repost ({post.repostsCount || 0})
                </button>
              )}
              {canEngage && onSave && (
                <button
                  onClick={() => onSave(post._id)}
                  className={`vv-post-menu-item w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name={isSaved ? "bookmarkFilled" : "bookmark"} />
                  {isSaved ? "Saved" : "Save"}
                </button>
              )}
              {canShare && (
                <button
                  type="button"
                  data-testid={`share-post-${post._id}`}
                  onClick={handleShare}
                  className={`vv-post-menu-item w-full ${FOCUS_RING}`}
                >
                  <span aria-hidden="true">🔗</span>
                  Share
                </button>
              )}

              {!isOwnPost && onFollow && (
                <button
                  onClick={() => onFollow(post.author._id)}
                  className={`vv-post-menu-item w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name={isFollowing ? "userCheck" : "userPlus"} />
                  {isFollowing ? "Following" : "Follow"}
                </button>
              )}
              {!isOwnPost && onToggleRelation && (
                <button
                  onClick={() => onToggleRelation(post.author._id, "mute")}
                  className={`vv-post-menu-item w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name={isMuted ? "unmute" : "mute"} />
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              )}
              {!isOwnPost && (onFollow || onToggleRelation || onReport) && (
                <div className="my-1 border-t border-black/5" />
              )}
              {!isOwnPost && onToggleRelation && (
                <button
                  onClick={() => {
                    const confirmed = isBlocked
                      ? true
                      : window.confirm("Block this user and hide their posts from your feed?");
                    if (confirmed) onToggleRelation(post.author._id, "block");
                  }}
                  className={`vv-post-menu-item vv-post-menu-item-danger w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name="shieldOff" />
                  {isBlocked ? "Unblock" : "Block"}
                </button>
              )}
              {!isOwnPost && onReport && (
                <>
                  <button
                    onClick={() => onReport(post._id)}
                    className={`vv-post-menu-item vv-post-menu-item-danger w-full ${FOCUS_RING}`}
                  >
                    <ActionIcon name="flag" />
                    Report
                  </button>
                  <select
                    className="vv-select mt-1 w-full text-sm"
                    value={reportReason || "other"}
                    onChange={(e) => onReportReasonChange?.(post._id, e.target.value)}
                  >
                    <option value="misinformation">Misinformation</option>
                    <option value="spam">Spam</option>
                    <option value="abuse">Abuse</option>
                    <option value="other">Other</option>
                  </select>
                </>
              )}
              {isOwnPost && onDelete && (
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className={`vv-post-menu-item vv-post-menu-item-danger w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name="trash" />
                  Delete
                </button>
              )}
            </PostOverflowMenu>
          )}

          {shareFeedback && (
            <p data-testid={`share-feedback-${post._id}`} className="w-full text-xs text-slate-500">
              {shareFeedback}
            </p>
          )}
        </div>
      )}

      {variant === "profile-compact" && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {canEngage && onVote && (
            <>
              <button
                onClick={() => onVote(post._id, "accurate")}
                disabled={post.finalized}
                aria-label={`Endorse post by ${post.author?.username}`}
                className={`vv-post-action-button vv-post-action-strong ${FOCUS_RING}`}
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="thumbsUp" />
                </span>
                <span>{post.accurateVotes || 0}</span>
              </button>
              <button
                onClick={() => onVote(post._id, "inaccurate")}
                disabled={post.finalized}
                aria-label={`Oppose post by ${post.author?.username}`}
                className={`vv-post-action-button vv-post-action-oppose ${FOCUS_RING}`}
              >
                <span className="flex items-center gap-1.5">
                  <ActionIcon name="thumbsDown" />
                </span>
                <span>{post.inaccurateVotes || 0}</span>
              </button>
            </>
          )}
          <Link href={`/posts/${post._id}`} className="vv-link-accent text-xs font-medium">
            View full analysis &rarr;
          </Link>

          {hasOverflowContent && (
            <PostOverflowMenu postId={post._id} label={`More actions for post by ${post.author?.username}`}>
              {!isOwnPost && onReport && (
                <>
                  <button
                    onClick={() => onReport(post._id)}
                    className={`vv-post-menu-item vv-post-menu-item-danger w-full ${FOCUS_RING}`}
                  >
                    <ActionIcon name="flag" />
                    Report
                  </button>
                  <select
                    className="vv-select mt-1 w-full text-sm"
                    value={reportReason || "other"}
                    onChange={(e) => onReportReasonChange?.(post._id, e.target.value)}
                  >
                    <option value="misinformation">Misinformation</option>
                    <option value="spam">Spam</option>
                    <option value="abuse">Abuse</option>
                    <option value="other">Other</option>
                  </select>
                </>
              )}
              {isOwnPost && onDelete && (
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className={`vv-post-menu-item vv-post-menu-item-danger w-full ${FOCUS_RING}`}
                >
                  <ActionIcon name="trash" />
                  Delete
                </button>
              )}
            </PostOverflowMenu>
          )}
        </div>
      )}

      {variant === "feed" && (
        <div className="vv-divider pt-4">
          {isCommentsExpanded && (
            <div id={`comments-panel-${post._id}`} className="hidden sm:block">
              <div className="vv-post-comment-shell">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="vv-input flex-1"
                    placeholder="Add a comment"
                    aria-label={`Add a comment to post by ${post.author?.username}`}
                    value={commentInput}
                    onChange={(e) => onCommentInputChange?.(post._id, e.target.value)}
                  />
                  <button onClick={() => onAddComment?.(post._id)} className="vv-btn-accent">
                    Send
                  </button>
                </div>

                <div className="space-y-3">
                  {!comments ? (
                    <button onClick={() => onLoadComments?.(post._id)} className="vv-btn-secondary">
                      Load Comments
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment) => (
                        <div key={comment._id} className="vv-post-comment-thread">
                          <p className="mb-1 text-sm font-medium text-veriverse-dark">
                            {comment.author?.username}
                          </p>
                          <p className="text-sm leading-6 text-slate-700">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{post.finalized ? "Finalized" : "Open for voting"}</span>
        <span>
          {post.createdAt ? new Date(post.createdAt).toLocaleString() : "Unknown time"}
        </span>
      </div>

      {onDelete && (
        <ConfirmDialog
          open={isDeleteConfirmOpen}
          title="Delete this post?"
          description="Are you sure you want to delete this post?"
          confirmLabel="Delete"
          destructive
          onCancel={() => setIsDeleteConfirmOpen(false)}
          onConfirm={() => {
            setIsDeleteConfirmOpen(false);
            onDelete(post._id);
          }}
        />
      )}
    </div>
  );
}
