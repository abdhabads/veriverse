"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import EmptyState from "@/components/EmptyState";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import ActionIcon from "@/components/ActionIcons";
import ClaimVerdictBadge from "@/components/ClaimVerdictBadge";
import GroundedEvidencePanel from "@/components/GroundedEvidencePanel";
import PostCard, { type Post } from "@/components/PostCard";
import ClaimFollowButton from "@/components/ClaimFollowButton";
import { toGroundingSource, type ClaimVerdictPresentation } from "@/lib/claimPresentation";
import { api, getErrorMessage } from "@/lib/apiClient";

type PublicEvidenceItem = {
  sourceUrl: string;
  domain: string;
  publisher: string;
  sourceType: string;
  publishedAt: string | null;
  stance: "supports" | "contradicts" | "context" | "unknown";
  evidenceText: string | null;
};

type ClaimSummary = {
  id: string;
  canonicalText: string;
  claimType: string;
  domain: string;
  jurisdiction: string | null;
  temporalScope?: { type: string; value: string | null };
  firstSeenAt: string;
  lastEvaluatedAt: string | null;
};

type CurrentAssessment = {
  assessedAt: string;
  verdict: ClaimVerdictPresentation;
  confidenceLevel: string;
  evidenceSummary: { supportingCount: number; contradictingCount: number; contextCount: number };
  summary: string;
};

type HistoryItem = {
  assessedAt: string;
  verdict: ClaimVerdictPresentation;
  confidenceLevel: string;
  supportingCount: number;
  contradictingCount: number;
};

type ClaimApiResponse = {
  claim: ClaimSummary;
  assessmentStatus: "available" | "assessment_not_available";
  currentAssessment: CurrentAssessment | null;
  evidence: { supporting: PublicEvidenceItem[]; contradicting: PublicEvidenceItem[]; context: PublicEvidenceItem[] };
  history: HistoryItem[];
  relatedPosts: Post[];
  follow: { isFollowing: boolean; followerCount: number };
};

function formatFollowerCount(count: number): string {
  return count === 1 ? "1 follower" : `${count} followers`;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  very_low: "Very low confidence",
};

export default function ClaimPageClient({ id }: { id: string }) {
  const router = useRouter();

  const [data, setData] = useState<ClaimApiResponse | null>(null);
  const [message, setMessage] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const currentUser =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("user") || "null")
      : null;

  const fetchClaim = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await api.get(`/claims/${id}`);
      setData(res.data);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setMessage(getErrorMessage(error, "Failed to load claim"));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchClaim();
  }, [fetchClaim]);

  function updateRelatedPost(postId: string, updater: (post: Post) => Post) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        relatedPosts: prev.relatedPosts.map((post) => (post._id === postId ? updater(post) : post)),
      };
    });
  }

  async function votePost(postId: string, voteType: "accurate" | "inaccurate") {
    try {
      const res = await api.post(`/posts/${postId}/vote`, { voteType });
      updateRelatedPost(postId, (post) => ({ ...post, ...res.data.post }));
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to record vote"));
    }
  }

  async function reportPost(postId: string, reason: string) {
    try {
      const res = await api.post("/reports", { postId, reason });
      setMessage(res.data.message || "Report submitted.");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to submit report"));
    }
  }

  // Server mutations are idempotent (ensure-follow/ensure-unfollow), so the
  // count adjustment is tied to an actual local state transition rather
  // than blindly applying +1/-1 to every response - repeating the same
  // mutation must never double-count.
  function handleFollowChange(nextFollowing: boolean) {
    setData((prev) => {
      if (!prev) return prev;
      const wasFollowing = prev.follow.isFollowing;
      if (wasFollowing === nextFollowing) return prev;

      const delta = nextFollowing ? 1 : -1;
      return {
        ...prev,
        follow: {
          isFollowing: nextFollowing,
          followerCount: Math.max(0, prev.follow.followerCount + delta),
        },
      };
    });
  }

  const [reportReasons, setReportReasons] = useState<Record<string, string>>({});

  if (notFound) {
    return (
      <PageWrapper title="Claim" subtitle="This claim could not be found.">
        <EmptyState
          title="Claim not found"
          description="This claim may have been removed, or the link may be incorrect."
          action={
            <button onClick={() => router.push("/feed")} className="vv-btn-secondary">
              Back to Feed
            </button>
          }
        />
      </PageWrapper>
    );
  }

  const claim = data?.claim;

  return (
    <PageWrapper
      title={claim?.canonicalText || "Claim"}
      subtitle="What the available evidence currently indicates about this claim, and why."
    >
      <div className="vv-action-row mb-4">
        <button onClick={() => router.push("/feed")} className="vv-btn-secondary">
          Back to Feed
        </button>
      </div>

      {message && <Toast message={message} type="info" />}

      {loading && !data ? <LoadingSpinner label="Loading claim..." /> : null}

      {claim && data && (
        <>
          {/* Light metadata */}
          <div className="vv-card p-5 mb-6">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="vv-verdict-pill vv-verdict-neutral">{claim.domain}</span>
              {claim.jurisdiction && (
                <span className="vv-verdict-pill vv-verdict-neutral">{claim.jurisdiction}</span>
              )}
              {claim.temporalScope && claim.temporalScope.type !== "unspecified" && claim.temporalScope.value && (
                <span className="vv-verdict-pill vv-verdict-neutral">{claim.temporalScope.value}</span>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              First seen {new Date(claim.firstSeenAt).toLocaleDateString()}
              {claim.lastEvaluatedAt
                ? ` · Last assessed ${new Date(claim.lastEvaluatedAt).toLocaleDateString()}`
                : null}
            </p>
          </div>

          {/* Current assessment */}
          <div className="vv-card p-5 mb-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h3 className="vv-section-title">Current Assessment</h3>
              {/* P3.3: prominent (visible in the same card as the verdict,
                  above the fold) but visually secondary - a smaller, plain
                  button, never competing with the verdict pill itself. */}
              <div className="flex flex-col items-end gap-1">
                <ClaimFollowButton
                  claimId={id}
                  isFollowing={data.follow.isFollowing}
                  isLoggedIn={Boolean(currentUser)}
                  onChange={handleFollowChange}
                  onError={setMessage}
                  testId={`claim-follow-${id}`}
                  className="text-xs"
                />
                {data.follow.followerCount > 0 && (
                  <span className="text-xs text-slate-500">
                    {formatFollowerCount(data.follow.followerCount)}
                  </span>
                )}
              </div>
            </div>
            {data.assessmentStatus === "available" && data.currentAssessment ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <ClaimVerdictBadge verdict={data.currentAssessment.verdict} />
                  <span className="text-xs text-slate-500">
                    {CONFIDENCE_LABEL[data.currentAssessment.confidenceLevel] || "Confidence unknown"}
                  </span>
                </div>
                <p className="text-sm leading-6 text-veriverse-dark/80">
                  {data.currentAssessment.summary}
                </p>
              </>
            ) : (
              <EmptyState
                title="Assessment pending"
                description="VeriVerse hasn't finished assessing this claim yet. Check back soon."
              />
            )}
          </div>

          {/* Evidence (collapsible) */}
          <div className="vv-card p-5 mb-6">
            <button
              type="button"
              onClick={() => setEvidenceExpanded((prev) => !prev)}
              aria-expanded={evidenceExpanded}
              aria-controls="claim-evidence-panel"
              className="vv-focus-ring flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[0.03]"
            >
              <span className="vv-section-title">Evidence</span>
              <ActionIcon
                name="chevronDown"
                className={`text-veriverse-dark/50 transition-transform ${evidenceExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {evidenceExpanded && (
              <div id="claim-evidence-panel" className="mt-3">
                {data.evidence.supporting.length === 0 && data.evidence.contradicting.length === 0 ? (
                  <EmptyState
                    title="No evidence yet"
                    description="No supporting or contradicting sources have been attached to this claim yet."
                  />
                ) : (
                  <GroundedEvidencePanel
                    groundingSources={[...data.evidence.supporting, ...data.evidence.contradicting].map(
                      toGroundingSource
                    )}
                    supportCount={data.evidence.supporting.length}
                    contradictionCount={data.evidence.contradicting.length}
                  />
                )}
              </div>
            )}
          </div>

          {/* Context / uncertainty */}
          {data.evidence.context.length > 0 && (
            <div className="vv-card p-5 mb-6">
              <h3 className="vv-section-title mb-3">Context &amp; Uncertainty</h3>
              <p className="mb-3 text-xs text-veriverse-dark/60">
                These sources relate to the claim but don&rsquo;t clearly support or contradict it.
              </p>
              <div className="space-y-3">
                {data.evidence.context.map((item, index) => (
                  <div
                    key={`${item.sourceUrl}-${index}`}
                    className="rounded-2xl border border-veriverse-border bg-white/70 px-3 py-3 text-sm"
                  >
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="vv-link-accent block font-medium"
                    >
                      {item.publisher || item.domain || "Source"}
                    </a>
                    {item.evidenceText && (
                      <p className="mt-1 text-xs leading-5 text-veriverse-dark/60 italic">
                        &ldquo;{item.evidenceText}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assessment history (collapsible) */}
          <div className="vv-card p-5 mb-6">
            <button
              type="button"
              onClick={() => setHistoryExpanded((prev) => !prev)}
              aria-expanded={historyExpanded}
              aria-controls="claim-history-panel"
              className="vv-focus-ring flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[0.03]"
            >
              <span className="vv-section-title">Assessment History</span>
              <ActionIcon
                name="chevronDown"
                className={`text-veriverse-dark/50 transition-transform ${historyExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {historyExpanded && (
              <div id="claim-history-panel" className="mt-3">
                {data.history.length === 0 ? (
                  <p className="text-sm text-veriverse-dark/70">This is the first assessment.</p>
                ) : (
                  <div className="space-y-2">
                    {data.history.map((item, index) => (
                      <div
                        key={`${item.assessedAt}-${index}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-veriverse-border bg-white/60 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <ClaimVerdictBadge verdict={item.verdict} />
                          <span className="text-xs text-slate-500">
                            {CONFIDENCE_LABEL[item.confidenceLevel] || "Confidence unknown"}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {new Date(item.assessedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Posts discussing this claim */}
          <div className="vv-card p-5">
            <h3 className="vv-section-title mb-4">Posts Discussing This Claim</h3>
            {data.relatedPosts.length === 0 ? (
              <EmptyState
                title="No posts yet"
                description="No public posts are currently discussing this claim."
              />
            ) : (
              <div className="space-y-4">
                {data.relatedPosts.map((post) => (
                  <PostCard
                    key={post._id}
                    variant="profile-compact"
                    post={post}
                    currentUser={
                      currentUser
                        ? { _id: currentUser._id, username: currentUser.username, role: currentUser.role }
                        : null
                    }
                    currentUserId={currentUser?._id}
                    onVote={(postId, voteType) => votePost(postId, voteType)}
                    onReport={
                      currentUser && currentUser._id !== post.author?._id
                        ? (postId) => reportPost(postId, reportReasons[postId] || "other")
                        : undefined
                    }
                    reportReason={reportReasons[post._id] || "other"}
                    onReportReasonChange={(postId, reason) =>
                      setReportReasons((prev) => ({ ...prev, [postId]: reason }))
                    }
                    onNavigateToProfile={(username) => router.push(`/u/${username}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
