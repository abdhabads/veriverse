"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchAdminOverview } from "@/lib/adminClient";
import { getErrorMessage } from "@/lib/apiClient";

type Metrics = {
  totalUsers: number;
  totalPosts: number;
  totalReports: number;
  totalAppeals: number;
  pendingReports: number;
  pendingAppeals: number;
  flaggedPosts: number;
  expertReviewPosts: number;
  appealReviewPosts: number;
  finalizedPosts: number;
};

type HighRiskPost = {
  _id: string;
  content: string;
  status: string;
  aiRiskScore?: number;
  moderationReasons?: string[];
  author?: {
    username?: string;
    reputation?: number;
  };
};

type Appeal = {
  _id: string;
  status: string;
  reason?: string;
  appellant?: {
    username?: string;
  };
};

type AuditLog = {
  _id: string;
  actionType: string;
  createdAt?: string;
  actor?: {
    username?: string;
  };
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    clearMessage,
  } = usePageState();

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [highRiskPosts, setHighRiskPosts] = useState<HighRiskPost[]>([]);
  const [recentAppeals, setRecentAppeals] = useState<Appeal[]>([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AuditLog[]>([]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const data = await fetchAdminOverview();
      setMetrics(data.metrics || null);
      setHighRiskPosts(data.highRiskPosts || []);
      setRecentAppeals(data.recentAppeals || []);
      setRecentAuditLogs(data.recentAuditLogs || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load admin overview"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadDashboard);

  return (
    <PageWrapper
      title="Admin Dashboard"
      subtitle="Platform oversight, moderation workload, and trust operations."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={loadDashboard} className="vv-btn-secondary">
          Refresh
        </button>
        <button onClick={() => router.push("/admin/queues")} className="vv-btn-secondary">
          Queues
        </button>
        <button onClick={() => router.push("/admin/appeals")} className="vv-btn-secondary">
          Appeals
        </button>
        <button onClick={() => router.push("/expert")} className="vv-btn-secondary">
          Expert Review
        </button>
        <button onClick={() => router.push("/admin/users")} className="vv-btn-secondary">
          Users
        </button>
        <button onClick={() => router.push("/admin/trust-health")} className="vv-btn-secondary">
          Trust Health
        </button>
        <button onClick={() => router.push("/admin/analytics")} className="vv-btn-secondary">
          Analytics
        </button>
        <button onClick={() => router.push("/admin/trust-analytics")} className="vv-btn-secondary">
          Trust Analytics
        </button>
        <button onClick={() => router.push("/admin/audit")} className="vv-btn-secondary">
          Audit
        </button>
        <button onClick={() => router.push("/admin/export")} className="vv-btn-secondary">
          Export
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading admin dashboard..." />
      ) : metrics ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Users</p>
              <p className="text-3xl font-bold text-veriverse-blue">{metrics.totalUsers}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Posts</p>
              <p className="text-3xl font-bold text-veriverse-blue">{metrics.totalPosts}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Reports</p>
              <p className="text-3xl font-bold text-veriverse-purple">{metrics.totalReports}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Appeals</p>
              <p className="text-3xl font-bold text-veriverse-purple">{metrics.totalAppeals}</p>
            </div>
            <div className="vv-stat-card">
              <p className="text-sm text-slate-500">Finalized</p>
              <p className="text-3xl font-bold text-veriverse-dark">{metrics.finalizedPosts}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="vv-card p-4">
              <p className="text-sm text-slate-500">Pending Reports</p>
              <p className="text-2xl font-bold text-veriverse-dark">{metrics.pendingReports}</p>
            </div>
            <div className="vv-card p-4">
              <p className="text-sm text-slate-500">Pending Appeals</p>
              <p className="text-2xl font-bold text-veriverse-dark">{metrics.pendingAppeals}</p>
            </div>
            <div className="vv-card p-4">
              <p className="text-sm text-slate-500">Flagged Posts</p>
              <p className="text-2xl font-bold text-red-600">{metrics.flaggedPosts}</p>
            </div>
            <div className="vv-card p-4">
              <p className="text-sm text-slate-500">Expert Queue</p>
              <p className="text-2xl font-bold text-veriverse-purple">{metrics.expertReviewPosts}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="vv-card p-5">
              <h2 className="vv-section-title mb-4">Recent High-Risk Posts</h2>
              {highRiskPosts.length === 0 ? (
                <p className="text-sm text-slate-500">No high-risk posts found.</p>
              ) : (
                <div className="space-y-3">
                  {highRiskPosts.map((post) => (
                    <div key={post._id} className="vv-card-soft p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-veriverse-dark">
                            {post.author?.username || "Unknown"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Reputation: {Number(post.author?.reputation || 0)}
                          </p>
                        </div>
                        <span className="vv-pill-red">Risk {Number(post.aiRiskScore || 0)}</span>
                      </div>
                      <p className="mb-2 text-sm text-slate-700">{post.content}</p>
                      <div className="flex flex-wrap gap-2">
                        {(post.moderationReasons || []).slice(0, 3).map((reason) => (
                          <span key={reason} className="vv-pill-red">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="vv-card p-5">
                <h2 className="vv-section-title mb-4">Recent Appeals</h2>
                {recentAppeals.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent appeals.</p>
                ) : (
                  <div className="space-y-3">
                    {recentAppeals.map((appeal) => (
                      <div key={appeal._id} className="vv-card-soft p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="font-medium text-veriverse-dark">
                            {appeal.appellant?.username || "Unknown"}
                          </p>
                          <span className="vv-pill-purple">{appeal.status}</span>
                        </div>
                        {appeal.reason ? (
                          <p className="text-sm text-slate-700">{appeal.reason}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="vv-card p-5">
                <h2 className="vv-section-title mb-4">Recent Audit Activity</h2>
                {recentAuditLogs.length === 0 ? (
                  <p className="text-sm text-slate-500">No audit activity yet.</p>
                ) : (
                  <div className="space-y-3">
                    {recentAuditLogs.map((log) => (
                      <div key={log._id} className="vv-card-soft p-4">
                        <p className="font-medium text-veriverse-dark">{log.actionType}</p>
                        <p className="text-xs text-slate-500">
                          {log.actor?.username || "Unknown"}
                          {" - "}
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageWrapper>
  );
}