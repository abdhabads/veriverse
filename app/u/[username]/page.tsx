"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import PageWrapper from "@/components/PageWrapper";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";
import { getAiLabelTone, getDisplayedAiLabel } from "@/lib/trustPresentation";
import { api, getErrorMessage } from "@/lib/apiClient";
import ReputationInfo from "@/components/ReputationInfo";
import { fetchMySafetyRelations, toggleSafetyRelation } from "@/lib/profileTrustClient";

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
};

type Relation = {
  relationType: "block" | "mute";
  targetUser: {
    _id: string;
  };
};

type Post = {
  _id: string;
  content: string;
  status: string;
  aiLabel: string;
  expertDecision?: string;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: Array<{
    stance: "supports" | "contradicts" | "context" | "unknown";
  }>;
  contentType?: "claim" | "question" | "instruction" | "rhetorical_claim";
  accurateVotes: number;
  inaccurateVotes: number;
  createdAt: string;
};

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserChecked, setCurrentUserChecked] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followsYou, setFollowsYou] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [followCounts, setFollowCounts] = useState<{ followers: number; following: number } | null>(null);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [relationBusy, setRelationBusy] = useState(false);

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
      setMessage(error?.response?.data?.message || "Failed to load public profile");
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

  const toggleFollow = async () => {
    if (!user || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await api.post("/follow", { targetUserId: user._id });
      setIsFollowing(Boolean(res.data.following));
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Failed to update follow status"));
    } finally {
      setFollowBusy(false);
    }
  };

  const openConversation = async () => {
    if (!user || messageBusy) return;
    setMessageBusy(true);
    try {
      const res = await api.post("/messages/conversations", { targetUserId: user._id });
      router.push(`/messages/${res.data.conversation._id}`);
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Failed to start conversation"));
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

    if (relationType === "block" && !alreadyActive && !window.confirm(BLOCK_CONFIRM_MESSAGE)) {
      return;
    }

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

  return (
    <PageWrapper title="Public Profile" subtitle="See a contributor's reputation, badges, and published claims.">
      {message && <div className="vv-banner mb-4">{message}</div>}

      {user && (
        <div className="vv-card p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-16 h-16 rounded-full object-cover border border-veriverse-border"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-veriverse-slate border border-veriverse-border flex items-center justify-center text-sm text-veriverse-dark/60">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div>
                <h3 className="text-2xl font-semibold">{user.username}</h3>
                <p className="vv-subtitle">Reputation: {user.reputation}</p>
                <ReputationInfo className="mt-1" />
                <p className="vv-subtitle">Reward Points: {user.rewardPoints}</p>
                {followCounts && (
                  <p className="vv-subtitle mt-1">
                    <button
                      type="button"
                      data-testid="followers-count-link"
                      onClick={() => router.push(`/u/${user.username}/followers`)}
                      className="vv-link"
                    >
                      {followCounts.followers} Followers
                    </button>
                    {" · "}
                    <button
                      type="button"
                      data-testid="following-count-link"
                      onClick={() => router.push(`/u/${user.username}/following`)}
                      className="vv-link"
                    >
                      {followCounts.following} Following
                    </button>
                  </p>
                )}
              </div>
            </div>

            {currentUserChecked &&
              currentUser &&
              String(currentUser._id) !== String(user._id) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {!isBlocked && isFollowing !== null && (
                    <button
                      type="button"
                      data-testid="follow-toggle"
                      onClick={toggleFollow}
                      disabled={followBusy}
                      className={isFollowing ? "vv-btn-secondary" : "vv-btn-primary"}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </button>
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
                  <button
                    type="button"
                    data-testid="block-toggle"
                    onClick={() => toggleRelation("block")}
                    disabled={relationBusy}
                    className="vv-btn-danger"
                  >
                    {relationBusy ? "Working..." : isBlocked ? "Unblock" : "Block"}
                  </button>
                  <button
                    type="button"
                    data-testid="mute-toggle"
                    onClick={() => toggleRelation("mute")}
                    disabled={relationBusy}
                    className="vv-btn-secondary"
                  >
                    {relationBusy ? "Working..." : isMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              )}
          </div>

          <div className="vv-post-panel mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-veriverse-dark/50">
              Bio
            </p>
            {user.bio ? (
              <p className="text-sm leading-6 text-slate-700 whitespace-pre-wrap">{user.bio}</p>
            ) : (
              <p className="text-sm text-slate-500">This user has not added a bio yet.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(user.badges || []).length === 0 ? (
              <span className="vv-subtitle">No badges yet</span>
            ) : (
              user.badges?.map((badge) => (
                <span key={badge} className="vv-pill-blue">{badge}</span>
              ))
            )}
          </div>
        </div>
      )}

      <div className="vv-card p-6">
        <h3 className="vv-section-title mb-4">Posts</h3>

        {posts.length === 0 ? (
          <p className="vv-subtitle">No public posts found.</p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post._id} className="vv-card-soft p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TrustVerdictBadge
                      status={post.status}
                      expertDecision={post.expertDecision}
                      verificationScore={post.verificationScore}
                      contradictionCount={post.contradictionCount}
                      groundingSources={post.groundingSources}
                      contentType={post.contentType}
                    />
                    <span className={`vv-verdict-pill vv-verdict-${getAiLabelTone(getDisplayedAiLabel(post))}`}>
                      AI: {getDisplayedAiLabel(post).replaceAll("_", " ")}
                    </span>
                  </div>
                  <span className="text-xs text-veriverse-dark/50">
                    {post.accurateVotes} accurate / {post.inaccurateVotes} inaccurate
                  </span>
                </div>
                <p className="text-sm text-slate-700">{post.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
