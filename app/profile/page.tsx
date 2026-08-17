"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import {
  fetchMyProfile,
} from "@/lib/profileTrustClient";
import { getErrorMessage } from "@/lib/apiClient";

type UserProfile = {
  _id: string;
  username: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  reputation?: number;
  rewardPoints?: number;
  role?: string;
  badges?: string[];
  moderationStatus?: string;
  suspendedUntil?: string | null;
};

type Post = {
  _id: string;
  content: string;
  status: string;
  createdAt?: string;
  trustDecisionVersion?: number;
};

export default function ProfilePage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showSuccess,
    showError,
    clearMessage,
  } = usePageState();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    loadProfilePage();
  }, []);

  async function loadProfilePage() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const data = await fetchMyProfile();

      setProfile(data.user || null);
      setPosts(data.posts || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load profile"));
    } finally {
      setLoading(false);
    }
  }

  function renderStatusBadge(status?: string) {
    switch (status) {
      case "active":
        return <span className="vv-pill-green">Active</span>;
      case "warned":
        return <span className="vv-pill-purple">Warned</span>;
      case "suspended":
        return <span className="vv-pill-red">Suspended</span>;
      case "banned":
        return <span className="vv-pill-red">Banned</span>;
      default:
        return <span className="vv-pill-gray">Unknown</span>;
    }
  }

  return (
    <PageWrapper
      title="Profile"
      subtitle="Manage your identity, trust profile, and platform presence."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading profile..." />
      ) : !profile ? (
        <EmptyState title="Profile not found" />
      ) : (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-[1.1fr_1.4fr] gap-6">
            <div className="vv-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
                <div className="flex w-20 flex-col items-center">
                  <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-300 bg-slate-100">
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt={profile.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl text-slate-500">
                        {profile.username.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="vv-section-title">{profile.username}</h2>
                  <p className="text-sm text-slate-600">{profile.email}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="vv-pill-gray">{profile.role}</span>
                    {renderStatusBadge(profile.moderationStatus)}
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div className="vv-card-soft p-3">
                  <p className="text-xs text-slate-500">Reputation</p>
                  <p className="text-xl font-semibold text-veriverse-dark">
                    {Number(profile.reputation || 0)}
                  </p>
                </div>

                <div className="vv-card-soft p-3">
                  <p className="text-xs text-slate-500">Reward Points</p>
                  <p className="text-xl font-semibold text-veriverse-dark">
                    {Number(profile.rewardPoints || 0)}
                  </p>
                </div>

                <div className="vv-card-soft p-3">
                  <p className="text-xs text-slate-500">Badges</p>
                  <p className="text-xl font-semibold text-veriverse-dark">
                    {profile.badges?.length || 0}
                  </p>
                </div>
              </div>

              {profile.suspendedUntil && (
                <div className="vv-card-soft p-3 mb-4">
                  <p className="text-sm text-slate-700">
                    Suspended until: {new Date(profile.suspendedUntil).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => router.push("/leaderboard")}
                  className="vv-btn-secondary"
                >
                  Leaderboard
                </button>
                <button
                  onClick={() => router.push("/reputation")}
                  className="vv-btn-secondary"
                >
                  Reputation
                </button>
                <button
                  onClick={() => router.push("/rewards")}
                  className="vv-btn-secondary"
                >
                  Rewards
                </button>
                <button
                  onClick={() => router.push("/appeals")}
                  className="vv-btn-secondary"
                >
                  Appeals
                </button>
                <button
                  onClick={() => router.push("/safety")}
                  className="vv-btn-secondary"
                >
                  Safety Controls
                </button>
                <button
                  onClick={() => router.push("/account-management")}
                  className="vv-btn-secondary"
                >
                  Account Management
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="vv-card p-5">
                <h2 className="vv-section-title mb-4">Bio</h2>
                {profile.bio ? (
                  <p className="text-sm leading-6 text-slate-700 whitespace-pre-wrap">
                    {profile.bio}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    No bio added yet. Update it from Account Management.
                  </p>
                )}
                <div className="mt-4">
                  <button
                    onClick={() => router.push("/account-management")}
                    className="vv-btn-secondary"
                  >
                    Edit Account Details
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="vv-card p-5">
            <h2 className="vv-section-title mb-4">Your Posts</h2>

            {posts.length === 0 ? (
              <EmptyState
                title="No posts yet"
                description="Your published posts will appear here."
              />
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <div key={post._id} className="vv-card-soft p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="vv-pill-gray">{post.status}</span>
                      <span className="text-xs text-slate-500">
                        {post.createdAt
                          ? new Date(post.createdAt).toLocaleString()
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mb-2">{post.content}</p>
                    <p className="text-xs text-slate-500">
                      Trust Version: {Number(post.trustDecisionVersion || 1)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
