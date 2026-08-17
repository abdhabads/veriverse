"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import { fetchMyRewardLogs } from "@/lib/profileTrustClient";
import { getErrorMessage } from "@/lib/apiClient";

type RewardLog = {
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

export default function RewardsPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } =
    usePageState();

  const [logs, setLogs] = useState<RewardLog[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadRewards();
  }, []);

  async function loadRewards() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const data = await fetchMyRewardLogs();
      setLogs(data.logs || []);
      setTotal(Number(data.totalRewardPoints || user.rewardPoints || 0));
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load reward history"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper
      title="Rewards"
      subtitle="See how you earned and used value on VeriVerse."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading reward history..." />
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
            <p className="text-sm text-slate-500 mb-1">Current Reward Points</p>
            <p className="text-4xl font-bold text-veriverse-dark">{total}</p>
          </div>

          {logs.length === 0 ? (
            <EmptyState
              title="No reward history yet"
              description="Your rewards will appear here as you contribute accurately."
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