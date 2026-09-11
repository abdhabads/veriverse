"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import UserListItem from "@/components/UserListItem";

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
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [followsYouState, setFollowsYouState] = useState<Record<string, boolean>>({});
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
              <UserListItem
                key={user._id}
                user={user}
                isFollowing={currentUserId && user._id !== currentUserId ? Boolean(followState[user._id]) : undefined}
                onFollowChange={(userId, following) =>
                  setFollowState((prev) => ({ ...prev, [userId]: following }))
                }
                onFollowError={setMessage}
                followsYou={Boolean(followsYouState[user._id])}
                followTestId={`follow-list-${user.username}`}
              />
            ))}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
