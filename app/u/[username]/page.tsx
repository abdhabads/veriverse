"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ProfileHeader from "@/components/ProfileHeader";
import ProfileStats from "@/components/ProfileStats";
import ProfileSafetyMenu from "@/components/ProfileSafetyMenu";
import FollowButton from "@/components/FollowButton";
import PostCard, { type Post as PostCardPost } from "@/components/PostCard";
import { api, getErrorMessage } from "@/lib/apiClient";
import { fetchMySafetyRelations, toggleSafetyRelation } from "@/lib/profileTrustClient";
import { useStartConversation } from "@/hooks/useStartConversation";

const BLOCK_CONFIRM_MESSAGE =
  "Block this user? Their posts will be hidden from your feed, any Follow relationship between you will be removed, and you won't be able to message, comment/reply, or repost each other's posts. Unblocking later won't restore the Follow relationship.";

type User = {
  _id: string;
  username: string;
  email: string;
  bio?: string;
  reputation: number;
  rewardPoints: number;
  avatarUrl?: string;
  badges?: string[];
  role?: string;
};

type Relation = {
  relationType: "block" | "mute";
  targetUser: {
    _id: string;
  };
};

// Public-profile posts come back without an author object (redundant -
// every post here belongs to the profile being viewed). Reuses PostCard's
// own Post type otherwise, rather than a second, looser (`status: string`)
// definition; `author` is synthesized from the already-fetched profile
// user at render time, never from a new API field.
type Post = Omit<PostCardPost, "author"> & { author?: PostCardPost["author"] };

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const router = useRouter();
  const startConversation = useStartConversation();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserChecked, setCurrentUserChecked] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followsYou, setFollowsYou] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [followCounts, setFollowCounts] = useState<{ followers: number; following: number } | null>(null);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [relationBusy, setRelationBusy] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [reportReasons, setReportReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProfile();
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    axios
      .get(`/api/followers/${user._id}`)
      .then((res) =>
        setFollowCounts({
          followers: Number(res.data?.followers || 0),
          following: Number(res.data?.following || 0),
        })
      )
      .catch(() => setFollowCounts(null));
  }, [user]);

  useEffect(() => {
    if (!user || !currentUser) return;
    if (String(currentUser._id) === String(user._id)) return;

    api
      .get("/follow", { params: { targetUserId: user._id } })
      .then((res) => {
        setIsFollowing(Boolean(res.data.following));
        setFollowsYou(Boolean(res.data.followsYou));
      })
      .catch(() => setIsFollowing(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentUser]);

  useEffect(() => {
    if (!user || !currentUser) return;
    if (String(currentUser._id) === String(user._id)) return;

    fetchMySafetyRelations()
      .then((data) => setRelations(data.relations || []))
      .catch(() => setRelations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentUser]);

  const fetchProfile = async () => {
    try {
      const resolvedParams = await params;
      const res = await axios.get(`/api/users/${resolvedParams.username}`);
      setUser(res.data.user);
      setPosts(res.data.posts || []);
    } catch (error: any) {
      setNotFound(true);
      setMessage(error?.response?.data?.message || "Failed to load public profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await api.get("/me");
      setCurrentUser(res.data.user);
    } catch {
      // Not logged in - this page remains viewable by anonymous visitors.
      setCurrentUser(null);
    } finally {
      setCurrentUserChecked(true);
    }
  };

  const openConversation = async () => {
    if (!user || messageBusy) return;
    setMessageBusy(true);
    const errorMessage = await startConversation(user._id);
    if (errorMessage) {
      setMessage(errorMessage);
      setMessageBusy(false);
    }
  };

  const isBlocked = user
    ? relations.some(
        (item) => item.relationType === "block" && String(item.targetUser?._id) === String(user._id)
      )
    : false;
  const isMuted = user
    ? relations.some(
        (item) => item.relationType === "mute" && String(item.targetUser?._id) === String(user._id)
      )
    : false;

  const toggleRelation = async (relationType: "block" | "mute") => {
    if (!user || relationBusy) return;
    const alreadyActive = relationType === "block" ? isBlocked : isMuted;

    setRelationBusy(true);
    try {
      await toggleSafetyRelation({ targetUserId: user._id, relationType });

      setRelations((prev) => {
        if (alreadyActive) {
          return prev.filter(
            (item) =>
              !(item.relationType === relationType && String(item.targetUser?._id) === String(user._id))
          );
        }
        const exists = prev.some(
          (item) => item.relationType === relationType && String(item.targetUser?._id) === String(user._id)
        );
        if (exists) return prev;
        return [...prev, { relationType, targetUser: { _id: user._id } }];
      });

      if (relationType === "block" && !alreadyActive) {
        // The backend removes any existing Follow edge the moment a block is
        // created - reflect that immediately rather than leaving a stale
        // "Following"/"Follows you" state on screen.
        setIsFollowing(false);
        setFollowsYou(false);
      }

      setMessage(
        relationType === "block"
          ? alreadyActive
            ? "User unblocked."
            : "User blocked."
          : alreadyActive
          ? "User unmuted."
          : "User muted."
      );
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Failed to update relation"));
    } finally {
      setRelationBusy(false);
    }
  };

  const handleBlockToggleClick = () => {
    if (isBlocked) {
      void toggleRelation("block");
    } else {
      setBlockConfirmOpen(true);
    }
  };

  const votePost = async (postId: string, voteType: "accurate" | "inaccurate") => {
    try {
      const res = await api.post(`/posts/${postId}/vote`, { voteType });
      const updatedPost = res.data.post;
      setPosts((prev) =>
        prev.map((post) => (String(post._id) === String(postId) ? { ...post, ...updatedPost } : post))
      );
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Failed to record vote"));
    }
  };

  const reportPost = async (postId: string) => {
    const reason = reportReasons[postId] || "other";
    try {
      const res = await api.post("/reports", { postId, reason });
      setMessage(res.data.message || "Report submitted.");
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Failed to submit report"));
    }
  };

  const isViewingOwnProfile = Boolean(currentUser) && Boolean(user) && String(currentUser?._id) === String(user?._id);

  return (
    <PageWrapper title="Public Profile" subtitle="See a contributor's reputation, badges, and published claims.">
      {message && <div className="vv-banner mb-4">{message}</div>}

      {loading ? (
        <LoadingSpinner label="Loading profile..." />
      ) : !user ? (
        <EmptyState title="Profile not found" description={notFound ? "This user could not be found." : undefined} />
      ) : (
        <div className="space-y-6">
          <ProfileHeader
            username={user.username}
            avatarUrl={user.avatarUrl}
            bio={user.bio}
            bioFallback="This user has not added a bio yet."
            followerCount={followCounts?.followers}
            followingCount={followCounts?.following}
            onFollowersClick={() => router.push(`/u/${user.username}/followers`)}
            onFollowingClick={() => router.push(`/u/${user.username}/following`)}
            actions={
              currentUserChecked && currentUser && !isViewingOwnProfile ? (
                <>
                  {!isBlocked && isFollowing !== null && (
                    <FollowButton
                      targetUserId={user._id}
                      isFollowing={isFollowing}
                      onChange={setIsFollowing}
                      onError={setMessage}
                      testId="follow-toggle"
                    />
                  )}
                  {!isBlocked && followsYou && (
                    <span data-testid="follows-you-pill" className="vv-pill-gray">
                      Follows you
                    </span>
                  )}
                  {!isBlocked && (
                    <button
                      type="button"
                      data-testid="message-button"
                      onClick={openConversation}
                      disabled={messageBusy}
                      className="vv-btn-secondary"
                    >
                      {messageBusy ? "Opening..." : "Message"}
                    </button>
                  )}
                  <ProfileSafetyMenu label={`Safety options for ${user.username}`}>
                    <button
                      type="button"
                      data-testid="block-toggle"
                      onClick={handleBlockToggleClick}
                      disabled={relationBusy}
                      className="vv-post-menu-item vv-post-menu-item-danger w-full"
                    >
                      {relationBusy ? "Working..." : isBlocked ? "Unblock" : "Block"}
                    </button>
                    <button
                      type="button"
                      data-testid="mute-toggle"
                      onClick={() => toggleRelation("mute")}
                      disabled={relationBusy}
                      className="vv-post-menu-item w-full"
                    >
                      {relationBusy ? "Working..." : isMuted ? "Unmute" : "Mute"}
                    </button>
                  </ProfileSafetyMenu>
                </>
              ) : undefined
            }
          />

          <ProfileStats
            reputation={user.reputation}
            rewardPoints={user.rewardPoints}
            badges={user.badges || []}
          />

          <div className="vv-card p-6">
            <h3 className="vv-section-title mb-4">Posts</h3>

            {posts.length === 0 ? (
              <EmptyState title="No public posts found" />
            ) : (
              <div className="space-y-4">
                {posts.map((post) => {
                  const authoredPost: PostCardPost = {
                    ...post,
                    author: post.author ?? {
                      _id: user._id,
                      username: user.username,
                      avatarUrl: user.avatarUrl,
                      reputation: user.reputation,
                    },
                  };

                  return (
                    <PostCard
                      key={post._id}
                      variant="profile-compact"
                      post={authoredPost}
                      currentUser={
                        currentUser
                          ? { _id: currentUser._id, username: currentUser.username, role: currentUser.role }
                          : null
                      }
                      currentUserId={currentUser?._id}
                      onVote={votePost}
                      onReport={
                        currentUserChecked && !isViewingOwnProfile ? (postId) => reportPost(postId) : undefined
                      }
                      reportReason={reportReasons[post._id] || "other"}
                      onReportReasonChange={(postId, reason) =>
                        setReportReasons((prev) => ({ ...prev, [postId]: reason }))
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={blockConfirmOpen}
        title="Block this user?"
        description={BLOCK_CONFIRM_MESSAGE}
        confirmLabel="Block"
        destructive
        onCancel={() => setBlockConfirmOpen(false)}
        onConfirm={async () => {
          await toggleRelation("block");
          setBlockConfirmOpen(false);
        }}
      />
    </PageWrapper>
  );
}
