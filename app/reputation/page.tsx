 "use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import { fetchMyReputationLogs } from "@/lib/profileTrustClient";
import { getErrorMessage } from "@/lib/apiClient";
import ReputationInfo from "@/components/ReputationInfo";

type ReputationLog = {
  _id: string;
  actionType: string;
  pointsChange: number;
  reason?: string;
  createdAt?: string;
  trustDecisionVersion?: number;
  trustEventKey?: string;
  referencePost?: {
    _id?: string;
    content?: string;
    status?: string;
  };
};

export default function ReputationPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } =
    usePageState();

  const [logs, setLogs] = useState<ReputationLog[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadReputation();
  }, []);

  async function loadReputation() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const data = await fetchMyReputationLogs();
      setLogs(data.logs || []);
      setTotal(Number(data.totalReputation || user.reputation || 0));
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load reputation history"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper
      title="Reputation"
      subtitle="Track how your reputation changes as claims you publish reach finalized outcomes."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading reputation history..." />
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => router.push("/profile")}
              className="vv-btn-secondary"
            >
              Back to Profile
            </button>
          </div>

          <div className="vv-card p-5">
            <p className="text-sm text-slate-500 mb-1">Current Reputation</p>
            <p className="text-4xl font-bold text-veriverse-dark">{total}</p>
            <ReputationInfo variant="full" className="mt-2" />
          </div>

          <details className="vv-card p-5">
            <summary className="cursor-pointer select-none font-medium text-veriverse-dark">
              How reputation works
            </summary>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                Reputation is user-level - it reflects how your past posts were evaluated, not
                whether any single claim is currently true. Claim verification stays evidence-based
                and is shown separately on each post.
              </p>
              <p>Voting or commenting alone does not change your reputation.</p>
              <p>Reputation changes when a post you authored reaches a finalized outcome:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Community-finalized as verified: +5 reputation</li>
                <li>Community-finalized as false: -5 reputation</li>
                <li>Community-finalized as disputed: no reputation change</li>
                <li>Expert-finalized as verified: +7 reputation</li>
                <li>Expert-finalized as false: -7 reputation</li>
                <li>Expert-finalized as disputed: no reputation change</li>
              </ul>
            </div>
          </details>

          {logs.length === 0 ? (
            <EmptyState
              title="No reputation history yet"
              description="Your reputation changes will appear here as you participate."
            />
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log._id} className="vv-card p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="font-medium text-veriverse-dark">{log.actionType}</p>
                    <span
                      className={
                        Number(log.pointsChange) >= 0 ? "vv-pill-green" : "vv-pill-red"
                      }
                    >
                      {Number(log.pointsChange) > 0 ? "+" : ""}
                      {Number(log.pointsChange)}
                    </span>
                  </div>

                  {log.reason && (
                    <p className="text-sm text-slate-700 mb-2">{log.reason}</p>
                  )}

                  {log.referencePost?.content && (
                    <div className="vv-card-soft p-3 mb-2">
                      <p className="text-xs text-slate-500 mb-1">Related Post</p>
                      <p className="text-sm text-slate-700">
                        {log.referencePost.content}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {log.trustDecisionVersion && (
                      <span>Version: {log.trustDecisionVersion}</span>
                    )}
                    {log.createdAt && (
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
