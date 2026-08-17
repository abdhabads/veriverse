"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import { api, getErrorMessage } from "@/lib/apiClient";

type User = {
  _id: string;
  username: string;
  reputation: number;
  rewardPoints: number;
  badges?: string[];
};

export default function LeaderboardPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } =
    usePageState();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const res = await api.get("/leaderboard");
      setUsers(res.data.users || []);
    } catch (error: unknown) {
      showError(getErrorMessage(error, "Failed to load leaderboard"));
    } finally {
      setLoading(false);
    }
  }

  const topUser = users[0] || null;

  return (
    <PageWrapper
      title="Leaderboard"
      subtitle="See which contributors are building the most trust and reward momentum."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading leaderboard..." />
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="vv-card p-5">
              <p className="text-sm text-slate-500 mb-1">Ranked Accounts</p>
              <p className="text-4xl font-bold text-veriverse-dark">{users.length}</p>
            </div>

            <div className="vv-card p-5">
              <p className="text-sm text-slate-500 mb-1">Top Reputation</p>
              <p className="text-4xl font-bold text-veriverse-dark">
                {Number(topUser?.reputation || 0)}
              </p>
            </div>

            <div className="vv-card p-5">
              <p className="text-sm text-slate-500 mb-1">Top Reward Points</p>
              <p className="text-4xl font-bold text-veriverse-dark">
                {Number(topUser?.rewardPoints || 0)}
              </p>
            </div>
          </div>

          {users.length === 0 ? (
            <EmptyState
              title="No leaderboard entries yet"
              description="Leaderboard rankings will appear as members build trust and rewards on the platform."
            />
          ) : (
            <div className="space-y-3">
              {users.map((user, index) => (
                <div key={user._id} className="vv-card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="vv-pill-purple">#{index + 1}</span>
                        <p className="font-medium text-veriverse-dark">{user.username}</p>
                      </div>

                      <p className="text-sm text-slate-700 mb-2">
                        Reputation: {Number(user.reputation || 0)} • Reward Points: {Number(user.rewardPoints || 0)}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {(user.badges || []).length > 0 ? (
                          (user.badges || []).map((badge) => (
                            <span key={badge} className="vv-pill-blue">
                              {badge}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">No badges yet</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/u/${user.username}`)}
                      className="vv-btn-secondary"
                    >
                      View Profile
                    </button>
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