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
import { fetchAdminAnalytics } from "@/lib/adminClient";
import { getErrorMessage } from "@/lib/apiClient";

type DayCount = {
  date: string;
  count: number;
};

type DayPoints = {
  date: string;
  points: number;
};

type Analytics = {
  totals: {
    totalUsers: number;
    totalPosts: number;
    totalComments: number;
    totalReports: number;
    totalAppeals: number;
    totalRewardLogs: number;
    totalReputationLogs: number;
  };
  last7Days: {
    users: DayCount[];
    posts: DayCount[];
    comments: DayCount[];
    reports: DayCount[];
    appeals: DayCount[];
    rewards: DayPoints[];
    reputation: DayPoints[];
  };
  snapshots: {
    usersLast7Days: number;
    postsLast7Days: number;
    commentsLast7Days: number;
    reportsLast7Days: number;
    appealsLast7Days: number;
    usersLast30Days: number;
    postsLast30Days: number;
  };
};

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    clearMessage,
  } = usePageState();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();
      const data = await fetchAdminAnalytics();
      setAnalytics(data.analytics || null);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load analytics"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadAnalytics);

  const userMomentum = analytics
    ? analytics.snapshots.usersLast30Days - analytics.snapshots.usersLast7Days
    : 0;
  const postMomentum = analytics
    ? analytics.snapshots.postsLast30Days - analytics.snapshots.postsLast7Days
    : 0;

  const renderBarRow = <T extends { date: string }>(
    label: string,
    items: T[],
    getValue: (item: T) => number
  ) => {
    const maxValue = Math.max(...items.map((item) => getValue(item)), 1);

    return (
      <div className="vv-card p-5 sm:p-6">
        <h3 className="mb-4 text-lg vv-section-title">{label}</h3>
        <div className="space-y-3">
          {items.map((item) => {
            const value = getValue(item);
            const width = `${Math.max((value / maxValue) * 100, value > 0 ? 8 : 0)}%`;

            return (
              <div key={item.date}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">{item.date}</span>
                  <span className="font-medium text-veriverse-dark">{value}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full bg-[color:#6C63FF]" style={{ width }} />
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
      title="Platform Analytics"
      subtitle="Activity trends, moderation flow, and trust system performance."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={loadAnalytics} className="vv-btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading analytics..." />
      ) : !analytics ? (
        <EmptyState title="No data available" />
      ) : (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="vv-admin-command">
              <p className="vv-eyebrow mb-3 bg-white/10 text-white">Analytics Brief</p>
              <h2 className="mb-3 text-2xl font-bold sm:text-3xl">
                Platform momentum, moderation pressure, and trust-economy flow in one view.
              </h2>
              <p className="mb-5 max-w-2xl text-sm leading-7 text-orange-50/80 sm:text-[15px]">
                Use this dashboard to judge whether growth is healthy, whether moderation workload is rising faster than activity, and whether rewards are tracking real contribution.
              </p>

              <div className="vv-admin-strip">
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Users 7d</p>
                  <p className="text-3xl font-bold">{analytics.snapshots.usersLast7Days}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Posts 7d</p>
                  <p className="text-3xl font-bold">{analytics.snapshots.postsLast7Days}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Reports 7d</p>
                  <p className="text-3xl font-bold">{analytics.snapshots.reportsLast7Days}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-orange-100/72">Appeals 7d</p>
                  <p className="text-3xl font-bold">{analytics.snapshots.appealsLast7Days}</p>
                </div>
              </div>
            </div>

            <div className="vv-card p-5 sm:p-6">
              <SectionHeader
                title="Momentum Read"
                subtitle="Short-term platform movement against the 30-day baseline."
              />
              <div className="space-y-3">
                <div className="vv-admin-kpi">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">User Momentum Gap</p>
                  <p className="text-3xl font-bold text-veriverse-blue">{userMomentum}</p>
                  <p className="mt-2 text-xs text-slate-500">Difference between 30-day and 7-day user volume snapshots.</p>
                </div>
                <div className="vv-admin-kpi">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Post Momentum Gap</p>
                  <p className="text-3xl font-bold text-veriverse-purple">{postMomentum}</p>
                  <p className="mt-2 text-xs text-slate-500">How sharply content creation is moving relative to the broader monthly pace.</p>
                </div>
                <button onClick={() => router.push("/admin/trust-analytics")} className="w-full vv-btn-secondary">
                  Open Trust Analytics
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Total Users</p>
              <p className="text-3xl font-bold text-veriverse-blue">{analytics.totals.totalUsers}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Total Posts</p>
              <p className="text-3xl font-bold text-veriverse-blue">{analytics.totals.totalPosts}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Total Comments</p>
              <p className="text-3xl font-bold text-veriverse-purple">{analytics.totals.totalComments}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Total Reports</p>
              <p className="text-3xl font-bold text-red-600">{analytics.totals.totalReports}</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Users (7d)</p>
              <p className="text-2xl font-bold text-veriverse-dark">{analytics.snapshots.usersLast7Days}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Posts (7d)</p>
              <p className="text-2xl font-bold text-veriverse-dark">{analytics.snapshots.postsLast7Days}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Comments (7d)</p>
              <p className="text-2xl font-bold text-veriverse-dark">{analytics.snapshots.commentsLast7Days}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Reports (7d)</p>
              <p className="text-2xl font-bold text-veriverse-dark">{analytics.snapshots.reportsLast7Days}</p>
            </div>
            <div className="vv-admin-kpi">
              <p className="text-sm text-slate-500">Appeals (7d)</p>
              <p className="text-2xl font-bold text-veriverse-dark">{analytics.snapshots.appealsLast7Days}</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {renderBarRow("New Users (Last 7 Days)", analytics.last7Days.users, (item) => item.count)}
            {renderBarRow("New Posts (Last 7 Days)", analytics.last7Days.posts, (item) => item.count)}
            {renderBarRow("Comments (Last 7 Days)", analytics.last7Days.comments, (item) => item.count)}
            {renderBarRow("Reports (Last 7 Days)", analytics.last7Days.reports, (item) => item.count)}
            {renderBarRow("Appeals (Last 7 Days)", analytics.last7Days.appeals, (item) => item.count)}
            {renderBarRow("Reward Point Flow (Last 7 Days)", analytics.last7Days.rewards, (item) => item.points)}
            {renderBarRow("Reputation Change Flow (Last 7 Days)", analytics.last7Days.reputation, (item) => item.points)}
          </div>

          <div className="vv-card p-5 sm:p-6">
            <SectionHeader
              title="Analytics Notes"
              subtitle="How to interpret core platform activity signals."
            />
            <div className="space-y-3">
              <div className="vv-admin-list-item">
                <p className="mb-1 text-sm font-semibold text-veriverse-dark">Growth and activity</p>
                <p className="text-sm leading-6 text-slate-700">User, post, and comment volume together show whether the network is expanding and staying active.</p>
              </div>
              <div className="vv-admin-list-item">
                <p className="mb-1 text-sm font-semibold text-veriverse-dark">Moderation pressure</p>
                <p className="text-sm leading-6 text-slate-700">Reports and appeals should be read against posting volume, not in isolation.</p>
              </div>
              <div className="vv-admin-list-item">
                <p className="mb-1 text-sm font-semibold text-veriverse-dark">Trust economy movement</p>
                <p className="text-sm leading-6 text-slate-700">Reward and reputation flow help confirm whether contribution incentives are moving with real activity.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}