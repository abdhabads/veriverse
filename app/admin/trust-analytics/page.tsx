"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import SectionHeader from "@/components/SectionHeader";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchAdminTrustAnalytics } from "@/lib/adminClient";
import { getErrorMessage } from "@/lib/apiClient";

type OutcomePoint = {
  date: string;
  verified: number;
  false: number;
  disputed: number;
};

type FlowPoint = {
  date: string;
  points: number;
};

type TrustAnalytics = {
  summary: {
    totalPosts: number;
    verifiedPosts: number;
    falsePosts: number;
    disputedPosts: number;
    flaggedPosts: number;
    expertReviewPosts: number;
    appealReviewPosts: number;
    activeAppeals: number;
    approvedAppeals: number;
    rejectedAppeals: number;
    highRiskPosts: number;
  };
  ratios: {
    verifiedRate: number;
    falseRate: number;
    disputedRate: number;
    flaggedRate: number;
    highRiskRate: number;
  };
  trends: {
    outcomeTrend: OutcomePoint[];
    rewardFlow: FlowPoint[];
    reputationFlow: FlowPoint[];
  };
};

export default function AdminTrustAnalyticsPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    showSuccess,
    clearMessage,
  } = usePageState();
  const [trustAnalytics, setTrustAnalytics] = useState<TrustAnalytics | null>(null);
  const [scanRunning, setScanRunning] = useState(false);
  const [trustIssues, setTrustIssues] = useState<string[]>([]);

  const buildTrustIssues = (data: TrustAnalytics) => {
    const issues: string[] = [];
    if (data.ratios.falseRate >= 30) {
      issues.push(`False rate is high at ${data.ratios.falseRate}%.`);
    }
    if (data.ratios.flaggedRate >= 25) {
      issues.push(`Flagged rate is elevated at ${data.ratios.flaggedRate}%.`);
    }
    if (data.summary.expertReviewPosts + data.summary.appealReviewPosts >= 25) {
      issues.push("Expert and appeal queues are building up and may delay finalization.");
    }
    if (data.summary.activeAppeals >= 15) {
      issues.push("Active appeals are high and fairness review pressure is rising.");
    }
    if (data.ratios.verifiedRate <= 40) {
      issues.push(`Verified rate is low at ${data.ratios.verifiedRate}%.`);
    }
    return issues;
  };

  const loadTrustAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();
      const data = await fetchAdminTrustAnalytics();
      const nextTrustAnalytics = data.trustAnalytics || null;
      setTrustAnalytics(nextTrustAnalytics);
      setTrustIssues(nextTrustAnalytics ? buildTrustIssues(nextTrustAnalytics) : []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load trust analytics"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadTrustAnalytics);

  const runTrustHealthScan = async () => {
    try {
      setScanRunning(true);
      clearMessage();
      const data = await fetchAdminTrustAnalytics();
      const nextTrustAnalytics = data.trustAnalytics || null;
      setTrustAnalytics(nextTrustAnalytics);

      const issues = nextTrustAnalytics ? buildTrustIssues(nextTrustAnalytics) : [];
      setTrustIssues(issues);

      if (issues.length === 0) {
        showSuccess("Scan complete. No major trust-health issues found.");
      } else {
        showSuccess(`Scan complete. ${issues.length} issue${issues.length === 1 ? "" : "s"} found.`);
      }
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to run trust-health scan"));
    } finally {
      setScanRunning(false);
    }
  };

  const reviewPressure = trustAnalytics
    ? trustAnalytics.summary.expertReviewPosts +
      trustAnalytics.summary.appealReviewPosts +
      trustAnalytics.summary.activeAppeals
    : 0;

  const renderFlowRow = (
    title: string,
    items: FlowPoint[],
    colorClass: string
  ) => {
    const maxValue = Math.max(...items.map((item) => Math.abs(item.points)), 1);

    return (
      <div className="vv-card p-5">
        <h3 className="mb-4 text-lg vv-section-title">{title}</h3>
        <div className="space-y-3">
          {items.map((item) => {
            const width = `${Math.max((Math.abs(item.points) / maxValue) * 100, item.points !== 0 ? 8 : 0)}%`;

            return (
              <div key={item.date}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">{item.date}</span>
                  <span className="font-medium text-veriverse-dark">
                    {item.points > 0 ? "+" : ""}
                    {item.points}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-2.5 rounded-full ${colorClass}`} style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <PageWrapper
      title="Trust Analytics"
      subtitle="Verification quality, risk pressure, and trust-system health."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={loadTrustAnalytics} className="vv-btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading trust analytics..." />
      ) : !trustAnalytics ? (
        <EmptyState title="No data available" description="Trust analytics could not be loaded." />
      ) : (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="vv-admin-command">
              <p className="vv-eyebrow mb-3 bg-white/10 text-white">Trust Health Brief</p>
              <h2 className="mb-3 text-2xl font-bold sm:text-3xl">
                Verification quality and human-review pressure are visible in one control surface.
              </h2>
              <p className="mb-5 max-w-2xl text-sm leading-7 text-orange-50/80 sm:text-[15px]">
                Read these ratios as a live quality signal: how much content is resolving cleanly, how much is escalating, and how much fairness pressure is building behind appeals.
              </p>

              <div className="vv-admin-strip">
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Verified Rate</p>
                  <p className="text-3xl font-bold">{trustAnalytics.ratios.verifiedRate}%</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">False Rate</p>
                  <p className="text-3xl font-bold">{trustAnalytics.ratios.falseRate}%</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Flagged Rate</p>
                  <p className="text-3xl font-bold">{trustAnalytics.ratios.flaggedRate}%</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Review Pressure</p>
                  <p className="text-3xl font-bold">{reviewPressure}</p>
                </div>
              </div>
            </div>

            <div className="vv-card p-5 sm:p-6">
              <SectionHeader
                title="Quality Snapshot"
                subtitle="How resolved outcomes compare to escalated review paths."
              />
              <div className="space-y-3">
                <div className="vv-admin-kpi">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Verified Posts</p>
                  <p className="text-3xl font-bold text-green-600">{trustAnalytics.summary.verifiedPosts}</p>
                </div>
                <div className="vv-admin-kpi">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">False Posts</p>
                  <p className="text-3xl font-bold text-red-600">{trustAnalytics.summary.falsePosts}</p>
                </div>
                <div className="vv-admin-kpi">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Active Appeals</p>
                  <p className="text-3xl font-bold text-veriverse-dark">{trustAnalytics.summary.activeAppeals}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Verified Rate</p>
              <p className="text-3xl font-bold text-green-600">{trustAnalytics.ratios.verifiedRate}%</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">False Rate</p>
              <p className="text-3xl font-bold text-red-600">{trustAnalytics.ratios.falseRate}%</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Disputed Rate</p>
              <p className="text-3xl font-bold text-yellow-600">{trustAnalytics.ratios.disputedRate}%</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Flagged Rate</p>
              <p className="text-3xl font-bold text-veriverse-purple">{trustAnalytics.ratios.flaggedRate}%</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">High-Risk Rate</p>
              <p className="text-3xl font-bold text-veriverse-dark">{trustAnalytics.ratios.highRiskRate}%</p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Verified Posts</p>
              <p className="text-2xl font-bold text-green-600">{trustAnalytics.summary.verifiedPosts}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">False Posts</p>
              <p className="text-2xl font-bold text-red-600">{trustAnalytics.summary.falsePosts}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Expert Review Queue</p>
              <p className="text-2xl font-bold text-veriverse-purple">{trustAnalytics.summary.expertReviewPosts}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Active Appeals</p>
              <p className="text-2xl font-bold text-veriverse-dark">{trustAnalytics.summary.activeAppeals}</p>
            </div>
          </div>

          <div className="vv-card mb-6 p-5 sm:p-6">
            <SectionHeader
              title="Verification Outcome Trend (Last 7 Days)"
              subtitle="Daily mix of verified, false, and disputed outcomes."
            />

            <div className="space-y-4">
              {trustAnalytics.trends.outcomeTrend.map((item) => {
                const total = item.verified + item.false + item.disputed;
                const safeTotal = Math.max(total, 1);

                const verifiedWidth = `${(item.verified / safeTotal) * 100}%`;
                const falseWidth = `${(item.false / safeTotal) * 100}%`;
                const disputedWidth = `${(item.disputed / safeTotal) * 100}%`;

                return (
                  <div key={item.date} className="vv-admin-list-item">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600">{item.date}</span>
                      <span className="text-slate-700">
                        V: {item.verified} / F: {item.false} / D: {item.disputed}
                      </span>
                    </div>

                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-3 bg-green-500" style={{ width: verifiedWidth }} />
                      <div className="h-3 bg-red-500" style={{ width: falseWidth }} />
                      <div className="h-3 bg-yellow-400" style={{ width: disputedWidth }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {renderFlowRow(
              "Reward Point Flow (Last 7 Days)",
              trustAnalytics.trends.rewardFlow,
              "bg-[color:#6C63FF]"
            )}
            {renderFlowRow(
              "Reputation Change Flow (Last 7 Days)",
              trustAnalytics.trends.reputationFlow,
              "bg-[color:#0A2540]"
            )}
          </div>

          <div className="vv-card mb-6 p-5 sm:p-6">
            <SectionHeader
              title="Trust Health Scan"
              subtitle="Run and rerun a live issue scan without reloading the page."
              actions={
                <button
                  onClick={runTrustHealthScan}
                  className="vv-btn-primary"
                  disabled={scanRunning}
                >
                  {scanRunning ? "Scanning..." : "Run Scan"}
                </button>
              }
            />

            {trustIssues.length === 0 ? (
              <p className="text-sm text-slate-600">No issues detected in the current snapshot.</p>
            ) : (
              <div className="space-y-2">
                {trustIssues.map((issue) => (
                  <div key={issue} className="vv-admin-list-item">
                    <p className="text-sm text-slate-700">{issue}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="vv-card p-5 sm:p-6">
            <SectionHeader
              title="Trust Health Notes"
              subtitle="How to read shifts in trust quality and review pressure."
            />
            <div className="space-y-3">
              <div className="vv-admin-list-item">
                <p className="mb-1 text-sm font-semibold text-veriverse-dark">Verified outcomes</p>
                <p className="text-sm leading-6 text-slate-700">A higher verified rate usually means stronger accuracy outcomes and cleaner consensus.</p>
              </div>
              <div className="vv-admin-list-item">
                <p className="mb-1 text-sm font-semibold text-veriverse-dark">False and flagged pressure</p>
                <p className="text-sm leading-6 text-slate-700">Rising false or flagged rates can indicate abuse pressure or weakening content quality.</p>
              </div>
              <div className="vv-admin-list-item">
                <p className="mb-1 text-sm font-semibold text-veriverse-dark">Review backlog</p>
                <p className="text-sm leading-6 text-slate-700">Expert queue and appeals pressure show where human review demand is compounding.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
