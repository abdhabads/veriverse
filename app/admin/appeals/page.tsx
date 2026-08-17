"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchAppealsQueue, resolveAppeal } from "@/lib/adminClient";
import { runMutation } from "@/lib/runMutation";
import { getErrorMessage } from "@/lib/apiClient";

type Appeal = {
  _id: string;
  status: string;
  reason?: string;
  resolutionNote?: string;
  appellant?: {
    username?: string;
    reputation?: number;
  };
  post?: {
    _id?: string;
    content?: string;
    status?: string;
    trustDecisionVersion?: number;
  };
};

export default function AdminAppealsPage() {
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

  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingAppealId, setPendingAppealId] = useState("");

  const loadAppeals = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();
      const data = await fetchAppealsQueue();
      setAppeals(data.appeals || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load appeals queue"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadAppeals);

  async function handleDecision(appealId: string, decision: "approve" | "reject") {
    setPendingAppealId(appealId);

    await runMutation({
      action: () =>
        resolveAppeal({
          appealId,
          decision,
          resolutionNote: notes[appealId] || "",
        }),
      onSuccess: () => {
        setAppeals((prev) =>
          prev.map((appeal) =>
            String(appeal._id) === String(appealId)
              ? {
                  ...appeal,
                  status: decision === "approve" ? "approved" : "rejected",
                  resolutionNote: notes[appealId] || "",
                }
              : appeal
          )
        );
        showSuccess(`Appeal ${decision}d successfully.`);
      },
      onError: showError,
      onFinally: () => setPendingAppealId(""),
    });
  }

  return (
    <PageWrapper
      title="Appeals Queue"
      subtitle="Review and resolve challenged moderation decisions."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={() => router.push("/admin/audit")} className="vv-btn-secondary">
          Audit Logs
        </button>
        <button onClick={loadAppeals} className="vv-btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading appeals..." />
      ) : appeals.length === 0 ? (
        <EmptyState
          title="No appeals pending"
          description="Appeals will appear here when users challenge moderation decisions."
        />
      ) : (
        <div className="space-y-4">
          {appeals.map((appeal) => (
            <div key={appeal._id} className="vv-card p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-veriverse-dark">
                    {appeal.appellant?.username || "Unknown"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Reputation: {Number(appeal.appellant?.reputation || 0)}
                  </p>
                </div>

                <span className="vv-pill-purple">{appeal.status}</span>
              </div>

              {appeal.post?.content && (
                <div className="vv-card-soft p-3 mb-3">
                  <p className="text-xs text-slate-500 mb-1">Related Post</p>
                  <p className="text-sm text-slate-700 mb-1">{appeal.post.content}</p>
                  <p className="text-xs text-slate-500">
                    Status: {appeal.post.status} â€¢ Version:{" "}
                    {Number(appeal.post.trustDecisionVersion || 1)}
                  </p>
                </div>
              )}

              {appeal.reason && (
                <p className="text-sm text-slate-700 mb-3">{appeal.reason}</p>
              )}

              <textarea
                className="vv-textarea mb-3"
                rows={3}
                placeholder="Optional resolution note"
                value={notes[appeal._id] || ""}
                onChange={(e) =>
                  setNotes((prev) => ({
                    ...prev,
                    [appeal._id]: e.target.value,
                  }))
                }
              />

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleDecision(appeal._id, "approve")}
                  disabled={pendingAppealId === appeal._id}
                  className="vv-btn-accent"
                >
                  {pendingAppealId === appeal._id ? "Working..." : "Approve"}
                </button>

                <button
                  onClick={() => handleDecision(appeal._id, "reject")}
                  disabled={pendingAppealId === appeal._id}
                  className="vv-btn-danger"
                >
                  {pendingAppealId === appeal._id ? "Working..." : "Reject"}
                </button>

                {appeal.post?._id && (
                  <button
                    onClick={() => router.push(`/posts/${appeal.post?._id}`)}
                    className="vv-btn-secondary"
                  >
                    Open Post
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}