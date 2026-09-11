"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { logEvent } from "@/lib/logger";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import SectionHeader from "@/components/SectionHeader";
import Button from "@/components/ui/Button";
import ActionIcon from "@/components/ActionIcons";
import PostCard, { type Post, type User, type Comment } from "@/components/PostCard";
import { getTrustVerdict } from "@/lib/trustPresentation";
import { api, getErrorMessage } from "@/lib/apiClient";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import { runMutation } from "@/lib/runMutation";

type Relation = {
  relationType: "block" | "mute";
  targetUser: {
    _id: string;
  };
};

// Client-side-only presentation phases for the publish flow. There is no
// backend streaming/status endpoint - "checking" is an honest description of
// what VeriVerse may be doing during a longer request, shown purely on a
// client timer, never a confirmed backend event.
type PublishPhase = "idle" | "publishing" | "checking" | "success";

// Chosen so a typical fast response (well under a second, sub-~1s) never
// shows "checking" at all, while a genuinely slower request (AI screening +
// grounding) gives the user informative feedback well before it would start
// to feel frozen.
const CHECKING_DELAY_MS = 1500;
// Long enough to register as a real confirmation, short enough not to block
// the next action.
const SUCCESS_DISPLAY_MS = 1200;

function getPublishStatusText(phase: PublishPhase): string | null {
  switch (phase) {
    case "publishing":
      return "Publishing…";
    case "checking":
      return "Checking claim against available evidence…";
    case "success":
      return "Published ✓";
    default:
      return null;
  }
}

type FeedMode = "discovery" | "following";

export default function FeedPage() {
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

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [reportReasons, setReportReasons] = useState<Record<string, string>>({});
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [creatingPost, setCreatingPost] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [pendingPostActions, setPendingPostActions] = useState<Record<string, string>>({});

  // Backward-compatible aliases while existing UI handlers are migrated.
  const pageLoading = loading;
  const content = newPostContent;
  const setContent = setNewPostContent;
  const posting = creatingPost;
  const reportReasonMap = reportReasons;
  const setReportReasonMap = setReportReasons;

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  // P2.4: renamed from statusFilter - this now filters by the same
  // canonical verdict the cards themselves display (see getTrustVerdict()
  // usage in filteredPosts below), not a mix of score-only predicates and
  // raw backend status values that could silently disagree with the badge
  // shown on a card matched by the filter.
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
    };
  }, []);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [followedUserIds, setFollowedUserIds] = useState<string[]>([]);

  // Deliberately the same on server and client on first render (avoids a
  // hydration mismatch) - the mount effect below corrects it from the real
  // URL before loadFeedPage ever reads it, via next/navigation's
  // useSearchParams would force a Suspense boundary/CSR bailout on this
  // page that isn't otherwise needed, since everything else here is
  // already fetched client-side after mount.
  const [feedMode, setFeedMode] = useState<FeedMode>("discovery");
  // Guards against a slower, earlier fetch (e.g. from rapid mode switching,
  // or the initial mount's auth check being slower than a switch the user
  // triggers while it's still in flight) overwriting the result of a later
  // one - only the most recently issued feed request is allowed to commit
  // its result to state.
  const feedRequestSeqRef = useRef(0);
  // loadFeedPage is only ever invoked once, from a mount-only effect, so its
  // own closure over feedMode would otherwise go stale the moment the user
  // switches modes before that single call finishes its (slower) auth
  // check. Set synchronously (see below) before loadFeedPage starts, so it
  // always reads the URL-derived mode rather than a stale one.
  const feedModeRef = useRef<FeedMode>("discovery");

  function postsRequestParams(mode: FeedMode) {
    return mode === "following" ? { params: { feed: "following" } } : undefined;
  }

  useEffect(() => {
    const urlMode: FeedMode =
      new URLSearchParams(window.location.search).get("mode") === "following"
        ? "following"
        : "discovery";
    feedModeRef.current = urlMode;
    if (urlMode !== "discovery") setFeedMode(urlMode);
    void loadFeedPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFeedPage() {
    // Claimed immediately (before the auth-check round trip) so a mode
    // switch that happens while this is still in flight is correctly
    // treated as newer, regardless of which request resolves first.
    const seq = ++feedRequestSeqRef.current;
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;
      if (feedRequestSeqRef.current !== seq) return;

      setCurrentUser(user);

      const [postsRes, relationsRes] = await Promise.all([
        api.get("/posts", postsRequestParams(feedModeRef.current)),
        api.get("/relations/list"),
      ]);
      if (feedRequestSeqRef.current !== seq) return;

      const fetchedPosts = postsRes.data.posts || [];
      const fetchedRelations = relationsRes.data.relations || [];

      setPosts(fetchedPosts);
      setRelations(fetchedRelations);

      await Promise.all(
        fetchedPosts.slice(0, 10).map((post: Post) => fetchComments(post._id))
      );
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load feed"));
    } finally {
      setLoading(false);
    }
  }

  const fetchMe = async () => {
    try {
      const res = await api.get("/me");
      setCurrentUser(res.data.user);
    } catch {
      localStorage.removeItem("user");
      router.push("/login");
    }
  };

  const fetchPosts = async (mode: FeedMode = feedMode) => {
    const seq = ++feedRequestSeqRef.current;
    try {
      const res = await api.get("/posts", postsRequestParams(mode));
      if (feedRequestSeqRef.current !== seq) return;
      const fetchedPosts = res.data.posts || [];
      setPosts(fetchedPosts);
    } catch {
      if (feedRequestSeqRef.current !== seq) return;
      showError("Failed to load posts");
    }
  };

  const switchFeedMode = (mode: FeedMode) => {
    if (mode === feedMode) return;
    setFeedMode(mode);
    feedModeRef.current = mode;
    // Clear immediately so the previous mode's posts never appear to belong
    // to the newly selected mode while the new fetch is in flight.
    setPosts([]);
    router.replace(mode === "following" ? "/feed?mode=following" : "/feed", {
      scroll: false,
    });
    setLoading(true);
    fetchPosts(mode).finally(() => setLoading(false));
  };

  async function fetchComments(postId: string) {
    try {
      const res = await api.get(`/posts/${postId}/comments`);
      setCommentsMap((prev) => ({
        ...prev,
        [postId]: res.data.comments || [],
      }));
    } catch {
      // silent on purpose for feed UX
    }
  }

  async function createPost() {
    const content = newPostContent.trim();
    if (!content) {
      showError("Post content is required.");
      return;
    }

    setCreatingPost(true);
    setPublishPhase("publishing");
    // Client-side-only timer: swaps the status copy after a short interval
    // if the request is still in flight. Never starts another request,
    // never polls, never assumes grounding occurred - purely presentational.
    publishTimerRef.current = setTimeout(() => {
      setPublishPhase("checking");
    }, CHECKING_DELAY_MS);

    await runMutation({
      action: () =>
        api.post("/posts", {
          content,
        }),
      onSuccess: async (res) => {
        if (publishTimerRef.current) {
          clearTimeout(publishTimerRef.current);
          publishTimerRef.current = null;
        }
        setPublishPhase("success");

        const createdPost = res.data.post as Post;
        prependPost(createdPost);
        setNewPostContent("");
        showSuccess("Post published successfully.");

        publishTimerRef.current = setTimeout(() => {
          setPublishPhase("idle");
        }, SUCCESS_DISPLAY_MS);
      },
      onError: (message) => {
        if (publishTimerRef.current) {
          clearTimeout(publishTimerRef.current);
          publishTimerRef.current = null;
        }
        setPublishPhase("idle");
        showError(message);
      },
      onFinally: () => setCreatingPost(false),
    });
  }
  // Log AI high risk events
  useEffect(() => {
    posts.forEach((post) => {
      if (post.aiLabel === "high_risk") {
        logEvent("AI_RISK_HIGH", { postId: post._id, score: post.aiRiskScore });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const votePost = async (postId: string, voteType: "accurate" | "inaccurate") => {
    setPostPending(postId, `vote-${voteType}`);

    await runMutation({
      action: () =>
        api.post(`/posts/${postId}/vote`, {
          voteType,
        }),
      onSuccess: (res) => {
        const updatedPost = res.data.post as Post;

        updatePost(postId, (post) => ({
          ...post,
          ...updatedPost,
        }));

        showSuccess(res.data.message || "Vote recorded.");
      },
      onError: showError,
      onFinally: () => setPostPending(postId, null),
    });
  };

  const addComment = async (postId: string) => {
    const content = (commentInputs[postId] || "").trim();
    if (!content) {
      showError("Comment cannot be empty.");
      return;
    }

    await runMutation({
      action: () =>
        api.post(`/posts/${postId}/comments`, {
          content,
        }),
      onSuccess: (res) => {
        const newComment = res.data.comment as Comment;

        setCommentsMap((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), newComment],
        }));

        setCommentInputs((prev) => ({
          ...prev,
          [postId]: "",
        }));

        showSuccess("Comment added.");
      },
      onError: showError,
    });
  };

  const startEdit = (postId: string, existingContent: string) => {
    setEditingPostId(postId);
    setEditContent(existingContent);
  };

  const saveEdit = async (postId: string) => {
    try {
      await api.patch(`/posts/${postId}`, { content: editContent });
      setEditingPostId(null);
      setEditContent("");
      showSuccess("Post updated");
      fetchPosts();
    } catch (error: unknown) {
      showError(getErrorMessage(error, "Failed to update post"));
    }
  };

  const deletePost = async (postId: string) => {
    try {
      await api.delete(`/posts/${postId}`);
      showSuccess("Post deleted");
      fetchPosts();
      fetchMe();
    } catch (error: unknown) {
      showError(getErrorMessage(error, "Failed to delete post"));
    }
  };

  const reportPost = async (postId: string) => {
    const reason = (reportReasons[postId] || "").trim();
    const note = (reportNotes[postId] || "").trim();

    if (!reason) {
      showError("Please select a report reason.");
      return;
    }

    setPostPending(postId, "report");

    await runMutation({
      action: () =>
        api.post("/reports", {
          postId,
          reason,
          note,
        }),
      onSuccess: (res) => {
        showSuccess(res.data.message || "Report submitted.");

        setReportReasons((prev) => ({ ...prev, [postId]: "" }));
        setReportNotes((prev) => ({ ...prev, [postId]: "" }));
      },
      onError: showError,
      onFinally: () => setPostPending(postId, null),
    });
  };

  const followUser = async (userId: string) => {
    try {
      const res = await api.post("/follow", { targetUserId: userId });
      const following = res.data.following ?? true;
      setFollowedUserIds((prev) =>
        following
          ? prev.includes(userId)
            ? prev
            : [...prev, userId]
          : prev.filter((id) => String(id) !== String(userId))
      );
      showSuccess(following ? "Followed!" : "Unfollowed");
    } catch (error: unknown) {
      showError(getErrorMessage(error, "Failed to follow"));
    }
  };

  const savePost = async (postId: string) => {
    setPostPending(postId, "save");

    await runMutation({
      action: () => api.post("/save", { postId }),
      onSuccess: (res) => {
        const saved = res.data.saved ?? true;
        setSavedPostIds((prev) =>
          saved
            ? prev.includes(postId)
              ? prev
              : [...prev, postId]
            : prev.filter((id) => String(id) !== String(postId))
        );
        showSuccess(saved ? "Post saved." : "Post removed from saved.");
      },
      onError: showError,
      onFinally: () => setPostPending(postId, null),
    });
  };

  const repostPost = async (postId: string) => {
    setPostPending(postId, "repost");

    await runMutation({
      action: () => api.post("/repost", { postId }),
      onSuccess: (res) => {
        const reposted = Boolean(res.data.reposted);
        const repostsCount = res.data.repostsCount;
        updatePost(postId, (post) => ({
          ...post,
          repostsCount: typeof repostsCount === "number"
            ? repostsCount
            : Math.max(0, Number(post.repostsCount || 0) + (reposted ? 1 : -1)),
        }));
        showSuccess(reposted ? "Post reposted." : "Repost removed.");
      },
      onError: showError,
      onFinally: () => setPostPending(postId, null),
    });
  };

  const visiblePosts = useMemo(() => {
    const blockedOrMutedIds = new Set(
      relations.map((relation) => String(relation.targetUser?._id))
    );

    return posts.filter(
      (post) => !blockedOrMutedIds.has(String(post.author?._id))
    );
  }, [posts, relations]);

  function setPostPending(postId: string, action: string | null) {
    setPendingPostActions((prev) => {
      const next = { ...prev };
      if (!action) {
        delete next[postId];
        return next;
      }
      next[postId] = action;
      return next;
    });
  }

  function hasRelation(userId: string, relationType: "block" | "mute") {
    return relations.some(
      (relation) =>
        relation.relationType === relationType &&
        String(relation.targetUser?._id) === String(userId)
    );
  }

  function updatePost(postId: string, updater: (post: Post) => Post) {
    setPosts((prev) =>
      prev.map((post) => (String(post._id) === String(postId) ? updater(post) : post))
    );
  }

  function prependPost(newPost: Post) {
    setPosts((prev) => [newPost, ...prev]);
  }

  function removePostsByAuthor(authorId: string) {
    setPosts((prev) =>
      prev.filter((post) => String(post.author?._id) !== String(authorId))
    );
  }

  const filteredPosts = useMemo(() => {
    const filtered = visiblePosts.filter((post) => {
      const matchesSearch =
        post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.author?.username?.toLowerCase().includes(searchTerm.toLowerCase());

      // P2.4: matches the exact same canonical verdict label the post's own
      // card renders (getTrustVerdict() is the single source of truth both
      // read from), so a post can never appear under a filter option whose
      // label contradicts what its own badge says. Workflow/moderation
      // states (flagged, under_expert_review, under_appeal_review) are
      // deliberately not offered as filter options here - see the "Verdict"
      // optgroup below - since they describe process, not evidentiary
      // conclusion, and this ordinary-user control isn't the place for a
      // second moderation-state filter.
      const matchesVerdict =
        verdictFilter === "all" ||
        getTrustVerdict({
          status: post.status,
          expertDecision: post.expertDecision,
          verificationScore: post.verificationScore,
          contradictionCount: post.contradictionCount,
          groundingSources: post.groundingSources,
          contentType: post.contentType,
        }).label === verdictFilter;

      return matchesSearch && matchesVerdict;
    });

    // Sort
    if (sortOrder === "recent") {
      filtered.sort(
        (a, b) => new Date(b.createdAt || Date.now()).getTime() - new Date(a.createdAt || Date.now()).getTime()
      );
    } else if (sortOrder === "most_endorsed") {
      filtered.sort(
        (a, b) => Number(b.accurateVotes || 0) - Number(a.accurateVotes || 0)
      );
    } else if (sortOrder === "most_contradicted") {
      filtered.sort(
        (a, b) => Number(b.contradictionCount || 0) - Number(a.contradictionCount || 0)
      );
    } else if (sortOrder === "highest_verification") {
      filtered.sort(
        (a, b) => Number(b.verificationScore || 0) - Number(a.verificationScore || 0)
      );
    } else if (sortOrder === "expert_reviewed") {
      filtered.sort((a, b) => {
        const aHas = a.expertDecision ? 1 : 0;
        const bHas = b.expertDecision ? 1 : 0;
        return bHas - aHas;
      });
    }

    return filtered;
  }, [visiblePosts, searchTerm, verdictFilter, sortOrder]);

  const toggleRelation = async (
    targetUserId: string,
    relationType: "block" | "mute"
  ) => {
    const alreadyActive = hasRelation(targetUserId, relationType);

    if (
      relationType === "block" &&
      !alreadyActive &&
      !window.confirm(
        "Block this user? Their posts will be hidden from your feed, any Follow relationship between you will be removed, and you won't be able to message, comment/reply, or repost each other's posts. Unblocking later won't restore the Follow relationship."
      )
    ) {
      return;
    }

    setPostPending(targetUserId, relationType);

    await runMutation({
      action: () =>
        api.post("/relations", {
          targetUserId,
          relationType,
        }),
      onSuccess: (res) => {
        const active = Boolean(res.data.active);

        setRelations((prev) => {
          const exists = prev.some(
            (item) =>
              item.relationType === relationType &&
              String(item.targetUser?._id) === String(targetUserId)
          );

          if (active && !exists) {
            return [
              ...prev,
              {
                relationType,
                targetUser: { _id: targetUserId },
              },
            ];
          }

          if (!active) {
            return prev.filter(
              (item) =>
                !(
                  item.relationType === relationType &&
                  String(item.targetUser?._id) === String(targetUserId)
                )
            );
          }

          return prev;
        });

        if (relationType === "block" || relationType === "mute") {
          if (active) {
            removePostsByAuthor(targetUserId);
          }
        }

        showSuccess(
          relationType === "block"
            ? active
              ? "User blocked."
              : "User unblocked."
            : active
            ? "User muted."
            : "User unmuted."
        );
      },
      onError: showError,
      onFinally: () => setPostPending(targetUserId, null),
    });
  };

  const currentUserId = currentUser?._id || currentUser?.id;
  const verifiedPosts = posts.filter((post) => post.status === "verified");
  const trendingPosts = [...posts].sort(
    (a, b) =>
      (Number(b.accurateVotes || 0) + Number(b.inaccurateVotes || 0)) -
      (Number(a.accurateVotes || 0) + Number(a.inaccurateVotes || 0))
  );

  return (
    <PageWrapper
      title="Feed"
      subtitle="Discover verified information and contribute to truth."
    >
      <div className="grid lg:grid-cols-[1.08fr_2.35fr] gap-4 sm:gap-6">
        {/* Feed-first at tablet/mobile (order-2 = after main column), a real
            secondary rail only at lg+/desktop (order-1 = back to the left
            column) - pure CSS order, no JS viewport detection. Profile
            Snapshot / How VeriVerse Works / Verified Highlights / Trending
            no longer render ahead of the actual feed below lg. */}
        <div className="order-2 space-y-6 lg:order-1">
          <div className="vv-card vv-surface-accent p-5">
            <p className="vv-eyebrow mb-3 bg-white/10 text-white">Profile Snapshot</p>
            <h2 className="text-2xl font-bold mb-3 text-white">Your Identity</h2>

            <div className="flex items-center gap-4 mb-4">
              {currentUser?.avatarUrl ? (
                <button
                  type="button"
                  onClick={() => router.push("/profile")}
                  className="rounded-full transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40"
                  aria-label="Open your profile"
                >
                  <Image
                    src={currentUser.avatarUrl}
                    alt={currentUser.username || "User"}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/15 object-cover"
                  />
                </button>
              ) : currentUser?.username ? (
                <button
                  type="button"
                  onClick={() => router.push("/profile")}
                  className="w-14 h-14 rounded-full bg-white/12 border border-white/15 flex items-center justify-center text-sm text-orange-50/80 transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40"
                  aria-label="Open your profile"
                >
                  {currentUser.username.slice(0, 1).toUpperCase()}
                </button>
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/12 border border-white/15" />
              )}

              <div>
                <button
                  type="button"
                  onClick={() => router.push("/profile")}
                  className="font-semibold text-white transition hover:underline focus:outline-none"
                >
                  {currentUser?.username || "User"}
                </button>
                <p className="text-sm text-orange-50/72">
                  Reputation: {currentUser?.reputation ?? 0}
                </p>
                <p className="text-sm text-orange-50/72">
                  Role: {currentUser?.role || "user"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* P2.3: the second stat here used to be labeled "Trust Level"
                  but rendered the exact same currentUser.reputation value
                  already shown above under "Reputation" - a literal
                  duplicate, not a distinct concept. Removed rather than
                  replaced with another person-level trust score: claim
                  trust and user reputation stay separate. */}
              <div className="vv-hero-stat bg-white/10 border-white/12">
                <p className="text-xs uppercase tracking-[0.2em] text-orange-100/70">Reward Points</p>
                <p className="text-xl font-bold text-white mt-2">
                  {currentUser?.rewardPoints || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="vv-card p-5">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-veriverse-purple">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 8V12L15 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              How VeriVerse Works
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-800 text-base">
              <li>AI checks content risk</li>
              <li>Evidence is gathered</li>
              <li>Community votes</li>
              <li>Experts review when needed</li>
            </ul>
          </div>

          <div className="vv-card p-5">
            <p className="vv-eyebrow mb-3">Community Signal</p>
            <h2 className="vv-section-title mb-3">Verified Highlights</h2>
            <div className="space-y-3">
              {verifiedPosts.length === 0 ? (
                <p className="vv-subtitle">No verified posts yet.</p>
              ) : (
                verifiedPosts.slice(0, 5).map((post) => (
                  <div key={post._id} className="vv-card-soft p-3">
                    <p className="text-sm font-medium text-veriverse-dark">
                      {post.author?.username}
                    </p>
                    <p className="text-sm text-slate-700 line-clamp-2">
                      {post.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="vv-card p-5">
            <p className="vv-eyebrow mb-3">Momentum</p>
            <h2 className="vv-section-title mb-3">Trending</h2>
            <div className="space-y-3">
              {trendingPosts.length === 0 ? (
                <p className="vv-subtitle">No trending posts yet.</p>
              ) : (
                trendingPosts.slice(0, 5).map((post) => (
                  <div key={post._id} className="vv-card-soft p-3">
                    <p className="text-sm font-medium text-veriverse-dark">
                      {post.author?.username}
                    </p>
                    <p className="text-sm text-slate-700 line-clamp-2">
                      {post.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="order-1 max-w-2xl mx-auto w-full space-y-6 lg:order-2 lg:max-w-none">
            {/* P2.3 hierarchy: mode -> composer -> posts, with the former
                "Discovery Filters" card demoted to a disclosable control
                right above the list it filters, instead of the first thing
                in the column. Same search/status/sort state and behavior,
                only the presentation moved. */}
            <div
              role="tablist"
              aria-label="Feed mode"
              className="flex gap-2 rounded-full border border-veriverse-border bg-white/60 p-1 w-fit"
            >
              <button
                type="button"
                role="tab"
                aria-selected={feedMode === "discovery"}
                data-testid="feed-mode-discovery"
                onClick={() => switchFeedMode("discovery")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e85d3f] ${
                  feedMode === "discovery"
                    ? "bg-veriverse-dark text-white"
                    : "text-veriverse-dark/60 hover:text-veriverse-dark"
                }`}
              >
                Discovery
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={feedMode === "following"}
                data-testid="feed-mode-following"
                onClick={() => switchFeedMode("following")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e85d3f] ${
                  feedMode === "following"
                    ? "bg-veriverse-dark text-white"
                    : "text-veriverse-dark/60 hover:text-veriverse-dark"
                }`}
              >
                Following
              </button>
            </div>

            <div className="vv-card p-5">
              <SectionHeader
                title="Create a Post"
                subtitle="Publish a claim, update, or source-backed note. Risk and review signals are attached automatically."
              />

              <textarea
                className="vv-textarea mb-3"
                rows={4}
                placeholder="Share something truthful..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {publishPhase === "idle" ? (
                  <p className="text-xs text-slate-500 max-w-xl">
                    Use hashtags like #truth #health #politics
                  </p>
                ) : (
                  <p
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-2 text-xs text-slate-500 max-w-xl"
                  >
                    {publishPhase !== "success" && (
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-slate-300 border-t-veriverse-purple animate-spin"
                      />
                    )}
                    {getPublishStatusText(publishPhase)}
                  </p>
                )}

                <Button
                  data-testid="publish-button"
                  onClick={createPost}
                  loading={posting || publishPhase !== "idle"}
                  variant="primary"
                >
                  {publishPhase === "idle" ? "Publish Post" : "Posting..."}
                </Button>
              </div>
            </div>

            {message && <Toast message={message} type={messageType} />}

            <div className="vv-card p-3">
              <button
                type="button"
                onClick={() => setIsFiltersOpen((prev) => !prev)}
                aria-expanded={isFiltersOpen}
                aria-controls="discovery-filters-panel"
                className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[0.03] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e85d3f]"
              >
                <span className="text-sm font-semibold text-veriverse-dark">
                  Filters &amp; sort
                  {(searchTerm || verdictFilter !== "all" || sortOrder !== "recent") && (
                    <span className="ml-2 vv-pill-blue">Active</span>
                  )}
                </span>
                <ActionIcon
                  name="chevronDown"
                  className={`text-veriverse-dark/50 transition-transform ${isFiltersOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isFiltersOpen && (
                <div id="discovery-filters-panel" className="mt-3 flex flex-col gap-3 px-2 pb-1">
                  <input
                    className="vv-input"
                    placeholder="Search posts or usernames"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />

                  <div className="flex flex-col sm:flex-row gap-3">
                    <select
                      className="vv-select flex-1"
                      value={verdictFilter}
                      onChange={(e) => setVerdictFilter(e.target.value)}
                    >
                      <optgroup label="All content">
                        <option value="all">All posts</option>
                      </optgroup>
                      {/* P2.4: one verdict-first filter, options are the
                          exact canonical verdict labels a card can show
                          (getTrustVerdict()'s own label strings) - not a
                          second, independently-defined set of buckets that
                          could name something a card would never actually
                          display. */}
                      <optgroup label="Verdict">
                        <option value="Well Supported">Well Supported</option>
                        <option value="Supported">Supported</option>
                        <option value="Weak Evidence">Weak Evidence</option>
                        <option value="Contradicted">Contradicted</option>
                        <option value="Unverified">Unverified</option>
                        <option value="Expert Verified">Expert Verified</option>
                        <option value="Expert Rejected">Expert Rejected</option>
                        <option value="Expert Disputed">Expert Disputed</option>
                      </optgroup>
                    </select>

                    <select
                      className="vv-select flex-1"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                    >
                      <option value="recent">Most Recent</option>
                      <option value="most_endorsed">Most Endorsed</option>
                      <option value="most_contradicted">Most Contradicted</option>
                      <option value="highest_verification">Highest Verification</option>
                      <option value="expert_reviewed">Expert Reviewed First</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {filteredPosts.length === 0 &&
              !pageLoading &&
              (feedMode === "following" ? (
                <EmptyState
                  title="Your Following feed is empty"
                  description="Follow people to see their posts here."
                  action={
                    <button
                      onClick={() => switchFeedMode("discovery")}
                      className="vv-btn-secondary"
                    >
                      Back to Discovery
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  title="No posts found"
                  description="No posts match your current search or filter."
                  action={
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setVerdictFilter("all");
                        setSortOrder("recent");
                      }}
                      className="vv-btn-secondary"
                    >
                      Clear Filters
                    </button>
                  }
                />
              ))}

            {pageLoading ? (
              <LoadingSpinner label="Loading posts..." />
            ) : filteredPosts.length === 0 ? null : (
            <div className="space-y-5">
              {filteredPosts.map((post) => (
                <PostCard
                  key={post._id}
                  variant="feed"
                  post={post}
                  currentUser={currentUser}
                  currentUserId={currentUserId}
                  isEditing={editingPostId === post._id}
                  editContent={editContent}
                  onEditContentChange={setEditContent}
                  onStartEdit={startEdit}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => {
                    setEditingPostId(null);
                    setEditContent("");
                  }}
                  isEvidenceExpanded={Boolean(expandedEvidence[post._id])}
                  onToggleEvidence={(postId) =>
                    setExpandedEvidence((prev) => ({
                      ...prev,
                      [postId]: !prev[postId],
                    }))
                  }
                  onVote={votePost}
                  onRepost={repostPost}
                  onSave={savePost}
                  isSaved={savedPostIds.includes(post._id)}
                  onDelete={deletePost}
                  onFollow={followUser}
                  onToggleRelation={toggleRelation}
                  isFollowing={followedUserIds.includes(post.author._id)}
                  isMuted={hasRelation(post.author._id, "mute")}
                  isBlocked={hasRelation(post.author._id, "block")}
                  onReport={reportPost}
                  reportReason={reportReasonMap[post._id] || "other"}
                  onReportReasonChange={(postId, reason) =>
                    setReportReasonMap((prev) => ({ ...prev, [postId]: reason }))
                  }
                  isCommentsExpanded={Boolean(expandedComments[post._id])}
                  onToggleComments={(postId) =>
                    setExpandedComments((prev) => ({
                      ...prev,
                      [postId]: !prev[postId],
                    }))
                  }
                  comments={commentsMap[post._id]}
                  commentInput={commentInputs[post._id] || ""}
                  onCommentInputChange={(postId, value) =>
                    setCommentInputs((prev) => ({ ...prev, [postId]: value }))
                  }
                  onAddComment={addComment}
                  onLoadComments={fetchComments}
                  onNavigateToProfile={(username) => router.push(`/u/${username}`)}
                />
              ))}
            </div>
            )}
        </div>
      </div>
    </PageWrapper>
  );
}
