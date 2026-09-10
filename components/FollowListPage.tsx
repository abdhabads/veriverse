"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";

type ListUser = {
  _id: string;
  username: string;
  avatarUrl?: string;
  reputation: number;
};

export default function FollowListPage({
  params,
  mode,
}: {
  params: Promise<{ username: string }>;
  mode: "followers" | "following";
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [followsYouState, setFollowsYouState] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<Record<string, boolean>>({});
  const followStateSeqRef = useRef(0);

  useEffect(() => {
    axios
      .get("/api/me")
      .then((res) => setCurrentUserId(res.data?.user?._id || null))
      .catch(() => setCurrentUserId(null));
  }, []);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      setMessage("");

      const resolvedParams = await params;
      setUsername(resolvedParams.username);

      const profileRes = await axios.get(`/api/users/${resolvedParams.username}`);
      const targetId = profileRes.data.user._id;

      const listRes = await axios.get(`/api/followers/${targetId}`, {
        params: { mode },
      });
      setUsers(listRes.data.users || []);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message || "Failed to load list");
      } else {
        setMessage("Failed to load list");
      }
    } finally {
      setLoading(false);
    }
  }, [params, mode]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!currentUserId || users.length === 0) {
      setFollowState({});
      setFollowsYouState({});
      return;
    }

    const targetIds = users.map((u) => u._id).filter((id) => id !== currentUserId);
    if (targetIds.length === 0) {
      setFollowState({});
      setFollowsYouState({});
      return;
    }

    const seq = ++followStateSeqRef.current;
    axios
      .get("/api/follow", { params: { targetUserIds: targetIds.join(",") } })
      .then((res) => {
        if (followStateSeqRef.current !== seq) return;
        setFollowState(res.data?.states || {});
        setFollowsYouState(res.data?.followsYouStates || {});
      })
      .catch(() => {
        if (followStateSeqRef.current !== seq) return;
        setFollowState({});
        setFollowsYouState({});
      });
  }, [users, currentUserId]);

  const toggleFollow = async (targetUserId: string) => {
    if (followBusy[targetUserId]) return;
    setFollowBusy((prev) => ({ ...prev, [targetUserId]: true }));
    try {
      const res = await axios.post("/api/follow", { targetUserId });
      setFollowState((prev) => ({ ...prev, [targetUserId]: Boolean(res.data?.following) }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message || "Failed to update follow status");
      } else {
        setMessage("Failed to update follow status");
      }
    } finally {
      setFollowBusy((prev) => ({ ...prev, [targetUserId]: false }));
    }
  };

  const title = username
    ? mode === "followers"
      ? `${username}'s Followers`
      : `${username}'s Following`
    : mode === "followers"
    ? "Followers"
    : "Following";

  return (
    <PageWrapper title={title}>
      {message && <Toast message={message} type="error" />}

      {loading ? (
        <LoadingSpinner label="Loading..." />
      ) : users.length === 0 ? (
        <EmptyState
          title={mode === "followers" ? "No followers yet" : "Not following anyone yet"}
        />
      ) : (
        <div className="vv-card p-4 sm:p-5">
          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user._id}
                className="vv-post-panel flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/u/${user.username}`)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="w-10 h-10 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm vv-link">{user.username}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">Reputation: {user.reputation}</p>
                      {followsYouState[user._id] && (
                        <span className="vv-pill-gray text-[10px]">Follows you</span>
                      )}
                    </div>
                  </div>
                </button>

                {currentUserId && user._id !== currentUserId && (
                  <button
                    type="button"
                    data-testid={`follow-list-${user.username}`}
                    onClick={() => toggleFollow(user._id)}
                    disabled={Boolean(followBusy[user._id])}
                    className={followState[user._id] ? "vv-btn-secondary" : "vv-btn-primary"}
                  >
                    {followState[user._id] ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
