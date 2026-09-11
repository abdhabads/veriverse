"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PostCard, { type Post as PostCardPost } from "@/components/PostCard";
import ProfileHeader from "@/components/ProfileHeader";
import ProfileStats from "@/components/ProfileStats";
import UserListItem from "@/components/UserListItem";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import {
  fetchMyProfile,
} from "@/lib/profileTrustClient";
import { api, getErrorMessage } from "@/lib/apiClient";

type Suggestion = {
  _id: string;
  username: string;
  avatarUrl?: string;
  reputation: number;
};

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

// Own-profile posts come back without an author object (redundant - it's
// always the viewer). Reuses PostCard's own Post type otherwise, rather
// than a second, looser (`status: string`) definition; `author` is
// synthesized from the already-fetched profile at render time (see
// authoredPost below), never from a new API field.
type Post = Omit<PostCardPost, "author"> & { author?: PostCardPost["author"] };

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
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [postPendingDeleteId, setPostPendingDeleteId] = useState<string | null>(null);
  const [followCounts, setFollowCounts] = useState<{ followers: number; following: number } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

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

      if (data.user?._id) {
        api
          .get(`/followers/${data.user._id}`)
          .then((res) =>
            setFollowCounts({
              followers: Number(res.data?.followers || 0),
              following: Number(res.data?.following || 0),
            })
          )
          .catch(() => setFollowCounts(null));
      }

      api
        .get("/follow/suggestions")
        .then((res) => setSuggestions(res.data?.suggestions || []))
        .catch(() => setSuggestions([]));
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load profile"));
    } finally {
      setLoading(false);
    }
  }

  function requestDeletePost(postId: string) {
    setPostPendingDeleteId(postId);
  }

  function cancelDeletePost() {
    setPostPendingDeleteId(null);
  }

  async function confirmDeletePost() {
    const postId = postPendingDeleteId;
    if (!postId) return;

    setDeletingPostId(postId);
    clearMessage();

    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((post) => String(post._id) !== String(postId)));
      showSuccess("Post deleted successfully.");
    } catch (error: unknown) {
      showError(getErrorMessage(error, "Failed to delete post"));
    } finally {
      setDeletingPostId(null);
      setPostPendingDeleteId(null);
    }
  }

  return (
    <PageWrapper
      title="Profile"
      subtitle="Your identity, contribution, and posts on VeriVerse."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading profile..." />
      ) : !profile ? (
        <EmptyState title="Profile not found" />
      ) : (
        <div className="space-y-6">
          <ProfileHeader
            username={profile.username}
            avatarUrl={profile.avatarUrl}
            bio={profile.bio}
            bioFallback="No bio added yet. Add one from Edit Profile."
            followerCount={followCounts?.followers}
            followingCount={followCounts?.following}
            onFollowersClick={() => router.push(`/u/${profile.username}/followers`)}
            onFollowingClick={() => router.push(`/u/${profile.username}/following`)}
            actions={
              <button
                type="button"
                onClick={() => router.push("/account-management")}
                className="vv-btn-secondary"
              >
                Edit Profile
              </button>
            }
          />

          <ProfileStats
            reputation={profile.reputation || 0}
            rewardPoints={profile.rewardPoints || 0}
            badges={profile.badges || []}
          />

          {suggestions.length > 0 && (
            <div className="vv-card p-5">
              <h2 className="vv-section-title mb-4">Who to Follow</h2>
              <div className="space-y-3">
                {suggestions.map((suggestion) => (
                  <UserListItem
                    key={suggestion._id}
                    user={suggestion}
                    isFollowing={false}
                    onFollowChange={(userId, following) => {
                      if (following) {
                        setSuggestions((prev) => prev.filter((item) => item._id !== userId));
                      }
                    }}
                    onFollowError={showError}
                    followTestId={`suggestion-follow-${suggestion.username}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="vv-card p-5">
            <h2 className="vv-section-title mb-4">Your Posts</h2>

            {posts.length === 0 ? (
              <EmptyState
                title="No posts yet"
                description="Your published posts will appear here."
              />
            ) : (
              <div className="space-y-3">
                {posts.map((post) => {
                  const authoredPost: PostCardPost = {
                    ...post,
                    author: post.author ?? {
                      _id: profile._id,
                      username: profile.username,
                      avatarUrl: profile.avatarUrl,
                      reputation: profile.reputation,
                    },
                  };

                  return (
                    <PostCard
                      key={post._id}
                      variant="profile-compact"
                      post={authoredPost}
                      currentUser={{ _id: profile._id, username: profile.username, role: profile.role }}
                      currentUserId={profile._id}
                      onDelete={() => requestDeletePost(post._id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={postPendingDeleteId !== null}
        title="Delete this post?"
        description="Are you sure you want to delete this post?"
        confirmLabel="Delete"
        destructive
        onCancel={cancelDeletePost}
        onConfirm={confirmDeletePost}
      />
    </PageWrapper>
  );
}
