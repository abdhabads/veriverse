"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchAuditLogs } from "@/lib/adminClient";
import { getErrorMessage } from "@/lib/apiClient";

type AuditLog = {
  _id: string;
  actionType: string;
  actorRole: string;
  note?: string;
  createdAt: string;
  actor?: {
    username?: string;
    role?: string;
  };
  targetPost?: {
    content?: string;
    status?: string;
  };
  targetAppeal?: {
    status?: string;
    reason?: string;
  };
  targetReport?: {
    status?: string;
    reason?: string;
  };
  targetUser?: {
    username?: string;
    reputation?: number;
  };
};

export default function AdminAuditPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    clearMessage,
  } = usePageState();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const loadAudit = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();
      const data = await fetchAuditLogs();
      setLogs(data.logs || data.auditLogs || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load audit logs"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadAudit);

  return (
    <PageWrapper
      title="Admin Audit Logs"
      subtitle="Internal accountability history for moderation and review actions."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={() => router.push("/admin/appeals")} className="vv-btn-secondary">
          Appeals Queue
        </button>
        <button onClick={loadAudit} className="vv-btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading audit logs..." />
      ) : logs.length === 0 ? (
        <EmptyState title="No audit records found" />
      ) : (
        <div className="vv-card p-5">
          <h2 className="vv-section-title mb-4">Recent Actions</h2>

          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log._id} className="vv-card-soft p-4">
                <div className="mb-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-veriverse-dark">{log.actionType}</p>
                    <p className="text-sm text-slate-600">
                      Actor: {log.actor?.username || "Unknown"} ({log.actorRole})
                    </p>
                  </div>

                  <p className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>

                {log.note ? (
                  <p className="mb-3 text-sm text-slate-700">{log.note}</p>
                ) : null}

                <div className="grid gap-3 text-sm md:grid-cols-3">
                  {log.targetPost?.content ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs text-slate-500">Post</p>
                      <p className="text-slate-700">{log.targetPost.content}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Status: {log.targetPost.status}
                      </p>
                    </div>
                  ) : null}

                  {log.targetAppeal ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs text-slate-500">Appeal</p>
                      <p className="text-slate-700">Status: {log.targetAppeal.status}</p>
                      {log.targetAppeal.reason ? (
                        <p className="mt-1 text-xs text-slate-500">{log.targetAppeal.reason}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {log.targetReport ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs text-slate-500">Report</p>
                      <p className="text-slate-700">Status: {log.targetReport.status}</p>
                      {log.targetReport.reason ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Reason: {log.targetReport.reason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {log.targetUser ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs text-slate-500">User</p>
                      <p className="text-slate-700">{log.targetUser.username}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Reputation: {log.targetUser.reputation}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
