"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import { fetchMyAppeals } from "@/lib/profileTrustClient";
import { getErrorMessage } from "@/lib/apiClient";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";

type Appeal = {
  _id: string;
  status: string;
  reason?: string;
  createdAt?: string;
  resolutionNote?: string;
  post?: {
    _id?: string;
    content?: string;
    status?: string;
    trustDecisionVersion?: number;
    expertDecision?: string;
    verificationScore?: number | null;
    contradictionCount?: number;
    groundingSources?: Array<{
      stance: "supports" | "contradicts" | "context" | "unknown";
    }>;
  };
};

export default function AppealsPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } =
    usePageState();

  const [appeals, setAppeals] = useState<Appeal[]>([]);

  useEffect(() => {
    loadAppeals();
  }, []);

  async function loadAppeals() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const data = await fetchMyAppeals();
      setAppeals(data.appeals || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load appeals"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper
      title="Appeals"
      subtitle="Track the status of moderation decisions you challenged."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading appeals..." />
      ) : appeals.length === 0 ? (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => router.push("/profile")}
              className="vv-btn-secondary"
            >
              Back to Profile
            </button>
          </div>

          <EmptyState
            title="No appeals yet"
            description="Your submitted appeals will appear here."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => router.push("/profile")}
              className="vv-btn-secondary"
            >
              Back to Profile
            </button>
          </div>

          {appeals.map((appeal) => (
            <div key={appeal._id} className="vv-card p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="vv-pill-purple">{appeal.status}</span>
                <span className="text-xs text-slate-500">
                  {appeal.createdAt ? new Date(appeal.createdAt).toLocaleString() : ""}
                </span>
              </div>

              {appeal.post?.content && (
                <div className="vv-card-soft p-3 mb-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">Related Post</p>
                    <TrustVerdictBadge
                      status={appeal.post.status || "unverified"}
                      expertDecision={appeal.post.expertDecision}
                      verificationScore={appeal.post.verificationScore}
                      contradictionCount={appeal.post.contradictionCount}
                      groundingSources={appeal.post.groundingSources}
                    />
                  </div>
                  <p className="text-sm text-slate-700 mb-1">
                    {appeal.post.content}
                  </p>
                  <p className="text-xs text-slate-500">
                    Version: {Number(appeal.post.trustDecisionVersion || 1)}
                  </p>
                </div>
              )}

              {appeal.reason && (
                <div className="mb-2">
                  <p className="text-xs text-slate-500 mb-1">Appeal Reason</p>
                  <p className="text-sm text-slate-700">{appeal.reason}</p>
                </div>
              )}

              {appeal.resolutionNote && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Resolution Note</p>
                  <p className="text-sm text-slate-700">{appeal.resolutionNote}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
