"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import SectionHeader from "@/components/SectionHeader";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchTrustHealth } from "@/lib/adminClient";
import { getErrorMessage } from "@/lib/apiClient";
import { formatVerificationScore } from "@/lib/formatters";

type TrustHealthSummary = {
  totalPosts: number;
  flaggedPosts: number;
  highRiskPosts: number;
  expertReviewPosts: number;
  appealReviewPosts: number;
  insufficientEvidencePosts: number;
  contradictedEvidencePosts: number;
  pendingEvaluationPosts: number;
  reopenedEvaluationPosts: number;
  finalizedPosts: number;
  activeAppeals: number;
  avgVerificationScore?: number;
  lowVerificationCount?: number;
  verificationDistribution?: Array<{ _id: number | string; count: number }>;
};

type TrustHealthItem = {
  _id: string;
  content: string;
  status: string;
  aiRiskScore: number;
  moderationReasons: string[];
  groundingStatus: string;
  groundingSummary: string;
  groundingConfidence: number;
  contradictionCount: number;
  supportCount: number;
  trustEvaluationState: string;
  finalized: boolean;
  appealCount: number;
  activeAppealCount: number;
  createdAt?: string;
  updatedAt?: string;
  author?: {
    username?: string;
    reputation?: number;
  };
  healthTags: string[];
};

const limitOptions = [25, 50, 100, 200];

export default function AdminTrustHealthPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    clearMessage,
  } = usePageState();

  const [limit, setLimit] = useState(50);
  const [summary, setSummary] = useState<TrustHealthSummary | null>(null);
  const [items, setItems] = useState<TrustHealthItem[]>([]);

  const loadTrustHealth = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();
      const data = await fetchTrustHealth(limit);
      setSummary(data.summary || null);
      setItems(data.items || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load trust health"));
    } finally {
      setLoading(false);
    }
  }, [limit, setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadTrustHealth);

  const issues = summary
    ? [
        summary.highRiskPosts >= 10 ? `High-risk posts are elevated at ${summary.highRiskPosts}.` : null,
        summary.activeAppeals >= 10 ? `Active appeals are elevated at ${summary.activeAppeals}.` : null,
        summary.expertReviewPosts + summary.appealReviewPosts >= 15
          ? "Manual review queues are building up."
          : null,
        summary.insufficientEvidencePosts >= 10
          ? `Insufficient-evidence cases are elevated at ${summary.insufficientEvidencePosts}.`
          : null,
        summary.pendingEvaluationPosts >= 10
          ? `Pending trust evaluations are elevated at ${summary.pendingEvaluationPosts}.`
          : null,
      ].filter(Boolean)
    : [];

  const contradictionLog = [...items]
    .filter((item) => Number(item.contradictionCount || 0) > 0)
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
    )
    .slice(0, 8);

  return (
    <PageWrapper
      title="Trust Health"
      subtitle="Operational trust risks, unresolved evaluations, and review pressure."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={loadTrustHealth} className="vv-btn-secondary">
          Refresh
        </button>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <span>Limit</span>
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="bg-transparent outline-none"
          >
            {limitOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading trust health..." />
      ) : !summary ? (
        <EmptyState title="No trust health data" description="Trust health could not be loaded." />
      ) : (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="vv-admin-command">
              <p className="vv-eyebrow mb-3 bg-white/10 text-white">Trust Health Brief</p>
              <h2 className="mb-3 text-2xl font-bold sm:text-3xl">
                The review backlog, grounding quality, and unresolved risk signals are visible in one board.
              </h2>
              <p className="mb-5 max-w-2xl text-sm leading-7 text-orange-50/80 sm:text-[15px]">
                Use this view to spot operational stress before it becomes a moderation or trust-quality failure.
              </p>

              <div className="vv-admin-strip">
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">High Risk</p>
                  <p className="text-3xl font-bold">{summary.highRiskPosts}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Active Appeals</p>
                  <p className="text-3xl font-bold">{summary.activeAppeals}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Pending Eval</p>
                  <p className="text-3xl font-bold">{summary.pendingEvaluationPosts}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Insufficient Evidence</p>
                  <p className="text-3xl font-bold">{summary.insufficientEvidencePosts}</p>
                </div>
              </div>
            </div>

            <div className="vv-card p-5 sm:p-6">
              <SectionHeader
                title="Current Issues"
                subtitle="Immediate operational signals from the latest health snapshot."
              />
              {issues.length === 0 ? (
                <p className="text-sm text-slate-600">No elevated trust-health issues detected in the current snapshot.</p>
              ) : (
                <div className="space-y-3">
                  {issues.map((issue) => (
                    <div key={issue} className="vv-admin-list-item">
                      <p className="text-sm text-slate-700">{issue}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Flagged Posts</p>
              <p className="text-3xl font-bold text-red-600">{summary.flaggedPosts}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Expert Review</p>
              <p className="text-3xl font-bold text-veriverse-purple">{summary.expertReviewPosts}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Appeal Review</p>
              <p className="text-3xl font-bold text-veriverse-purple">{summary.appealReviewPosts}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Contradicted Evidence</p>
              <p className="text-3xl font-bold text-yellow-600">{summary.contradictedEvidencePosts}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Reopened Eval</p>
              <p className="text-3xl font-bold text-veriverse-dark">{summary.reopenedEvaluationPosts}</p>
            </div>
          </div>

          {/* Verification Score Distribution */}
          {summary?.verificationDistribution && (
            <div className="vv-card p-5 mb-6">
              <SectionHeader
                title="Verification Score Distribution"
                subtitle="How evidence strength is distributed across all posts."
              />
              <div className="flex items-end gap-3 h-32 mt-4">
                {[
                  { label: "Weak\n0-0.3", key: 0, color: "bg-rose-400" },
                  { label: "Mixed\n0.3-0.6", key: 0.3, color: "bg-amber-400" },
                  { label: "Supported\n0.6-0.8", key: 0.6, color: "bg-green-400" },
                  { label: "Strong\n0.8-1.0", key: 0.8, color: "bg-emerald-500" },
                ].map((bucket) => {
                  const match = summary.verificationDistribution?.find(
                    (d: { _id: number | string; count: number }) => d._id === bucket.key
                  );
                  const count = match?.count || 0;
                  const maxCount = Math.max(
                    ...(summary.verificationDistribution || []).map(
                      (d: { count: number }) => d.count
                    ),
                    1
                  );
                  const heightPct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={bucket.key} className="flex flex-col items-center flex-1 gap-1">
                      <span className="text-xs font-medium text-slate-600">{count}</span>
                      <div
                        className={`w-full rounded-t ${bucket.color} transition-all`}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="text-[10px] text-slate-500 text-center whitespace-pre-line leading-tight">
                        {bucket.label}
                      </span>
                    </div>
                  );
                })}
                {/* Unscored bucket */}
                {(() => {
                  const unscored = summary.verificationDistribution?.find(
                    (d: { _id: string | number }) => d._id === "unscored"
                  );
                  const count = unscored?.count || 0;
                  const maxCount = Math.max(
                    ...(summary.verificationDistribution || []).map(
                      (d: { count: number }) => d.count
                    ),
                    1
                  );
                  const heightPct = Math.round((count / maxCount) * 100);
                  return (
                    <div className="flex flex-col items-center flex-1 gap-1">
                      <span className="text-xs font-medium text-slate-600">{count}</span>
                      <div
                        className="w-full rounded-t bg-slate-300 transition-all"
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="text-[10px] text-slate-500 text-center whitespace-pre-line leading-tight">
                        {"Not\nEvaluated"}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span>Avg score: <strong>{formatVerificationScore(summary.avgVerificationScore)}</strong></span>
                <span>Low evidence posts: <strong>{summary.lowVerificationCount || 0}</strong></span>
              </div>
            </div>
          )}

          <div className="vv-card p-5 mb-6">
            <SectionHeader
              title="Contradiction Log"
              subtitle="Recent posts with contradictory evidence signals."
            />
            {contradictionLog.length === 0 ? (
              <p className="text-sm text-slate-600">No contradiction events found in the current trust-health window.</p>
            ) : (
              <div className="space-y-2">
                {contradictionLog.map((item) => (
                  <div key={item._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-veriverse-dark">{item.author?.username || "Unknown"}</p>
                      <span className="vv-pill-red">Contradictions: {item.contradictionCount}</span>
                      <span className="vv-pill-gray">Status: {item.status}</span>
                    </div>
                    <p className="text-sm text-slate-700 line-clamp-2">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="No trust-health items"
              description="No posts currently match the risk and review-health filters."
            />
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item._id} className="vv-card p-5">
                  <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-veriverse-dark">
                          {item.author?.username || "Unknown"}
                        </p>
                        <span className="vv-pill-red">Risk {item.aiRiskScore}</span>
                        <span className="vv-pill-gray">Status: {item.status}</span>
                        <span className="vv-pill-purple">Eval: {item.trustEvaluationState}</span>
                      </div>
                      <p className="mb-3 text-sm text-slate-700">{item.content}</p>
                      <div className="flex flex-wrap gap-2">
                        {item.healthTags.map((tag) => (
                          <span key={tag} className="vv-pill-gray">
                            {tag.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-sm text-slate-600 lg:text-right">
                      <p>Reputation: {Number(item.author?.reputation || 0)}</p>
                      <p>Appeals: {item.appealCount}</p>
                      <p>Active Appeals: {item.activeAppealCount}</p>
                      <p>Grounding: {item.groundingStatus}</p>
                      <p>Finalized: {item.finalized ? "Yes" : "No"}</p>
                    </div>
                  </div>

                  {(item.groundingSummary || item.moderationReasons.length > 0) ? (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      {item.groundingSummary ? (
                        <>
                          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Grounding Summary</p>
                          <p className="mb-2 text-sm text-slate-700">{item.groundingSummary}</p>
                        </>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <span className="vv-pill-gray">Confidence: {item.groundingConfidence}</span>
                        <span className="vv-pill-red">Contradictions: {item.contradictionCount}</span>
                        <span className="vv-pill-green">Supports: {item.supportCount}</span>
                        {item.moderationReasons.map((reason) => (
                          <span key={reason} className="vv-pill-red">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/posts/${item._id}`)}
                      className="vv-btn-secondary"
                    >
                      Open Post
                    </button>
                    <button
                      onClick={() => router.push("/admin/queues")}
                      className="vv-btn-secondary"
                    >
                      Open Queues
                    </button>
                    <button
                      onClick={() => router.push("/admin/trust-analytics")}
                      className="vv-btn-secondary"
                    >
                      Open Trust Analytics
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
}