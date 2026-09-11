"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import axios from "axios";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import FollowButton from "@/components/FollowButton";
import PostCard, { type Post as PostCardPost, type User as PostCardUser } from "@/components/PostCard";

type SearchUser = {
  _id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
};

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setType] = useState(searchParams.get("type") || "all");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<PostCardPost[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [currentUser, setCurrentUser] = useState<PostCardUser | null>(null);
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [messageBusy, setMessageBusy] = useState<Record<string, boolean>>({});
  // Guards the follow-state batch fetch against an older response (from a
  // prior search) overwriting a newer one if the user searches again quickly.
  const followStateSeqRef = useRef(0);

  const currentUserId = currentUser?._id;
  const hasQuery = Boolean(searchParams.get("q"));

  useEffect(() => {
    axios
      .get("/api/me")
      .then((res) => setCurrentUser(res.data?.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!currentUserId || users.length === 0) {
      setFollowState({});
      return;
    }

    const targetIds = users.map((u) => u._id).filter((id) => id !== currentUserId);
    if (targetIds.length === 0) {
      setFollowState({});
      return;
    }

    const seq = ++followStateSeqRef.current;
    axios
      .get("/api/follow", { params: { targetUserIds: targetIds.join(",") } })
      .then((res) => {
        if (followStateSeqRef.current !== seq) return;
        setFollowState(res.data?.states || {});
      })
      .catch(() => {
        if (followStateSeqRef.current !== seq) return;
        setFollowState({});
      });
  }, [users, currentUserId]);

  const openConversation = async (targetUserId: string) => {
    if (messageBusy[targetUserId]) return;
    setMessageBusy((prev) => ({ ...prev, [targetUserId]: true }));
    try {
      const res = await axios.post("/api/messages/conversations", { targetUserId });
      router.push(`/messages/${res.data.conversation._id}`);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message || "Failed to start conversation");
      } else {
        setMessage("Failed to start conversation");
      }
      setMessageBusy((prev) => ({ ...prev, [targetUserId]: false }));
    }
  };

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const t = searchParams.get("type") || "all";
    let cancelled = false;

    setQuery(q);
    setType(t);

    if (!q) {
      setUsers([]);
      setPosts([]);
      setHashtags([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    axios
      .get(`/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(t)}`)
      .then((res) => {
        if (cancelled) {
          return;
        }

        setUsers(res.data.users || []);
        setPosts(res.data.posts || []);
        setHashtags(res.data.hashtags || []);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          setMessage(error.response?.data?.message || "Search failed");
          return;
        }

        setMessage("Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const submitSearch = () => {
    if (loading) return;
    router.push(`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
  };

  const showUsers = type === "all" || type === "users";
  const showPosts = type === "all" || type === "posts";
  const showTopics = type === "all" || type === "topics";

  return (
    <PageWrapper
      title="Search"
      subtitle="Find people, claims, and topics, then move directly into the verification surfaces without dropping context."
    >
      <form
        className="vv-card p-4 sm:p-5 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
      >
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <input
            className="vv-input flex-1"
            placeholder="Search users, posts, or topics"
            aria-label="Search users, posts, or topics"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="vv-select w-full lg:w-[180px]"
            aria-label="Result type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All</option>
            <option value="users">Users</option>
            <option value="posts">Posts</option>
            <option value="topics">Topics</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="vv-btn-primary w-full lg:w-auto"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {message && <Toast message={message} type="error" />}

      {!hasQuery ? (
        <div className="vv-card p-8 text-center">
          <h3 className="vv-section-title mb-2">Search VeriVerse</h3>
          <p className="text-sm text-slate-600">Find people, claims, posts, and topics.</p>
        </div>
      ) : (
        <>
          {showTopics && hashtags.length > 0 && (
            <div className="vv-post-panel-accent mb-6">
              <h3 className="vv-section-title mb-3">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => router.push(`/topics/${tag}`)}
                    className="vv-pill-purple"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={showUsers && showPosts ? "grid gap-6 xl:grid-cols-[0.95fr_1.05fr]" : "space-y-6"}>
            {showUsers && (
              <div className="vv-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="vv-section-title">Users</h3>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{users.length} results</p>
                </div>

                {users.length === 0 ? (
                  <EmptyState title="No users found" description="Try a broader name, handle, or search across all result types." />
                ) : (
                  <div className="space-y-3">
                    {users.map((user) => (
                      <div key={user._id} className="vv-post-panel flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {user.avatarUrl ? (
                            <Image
                              src={user.avatarUrl}
                              alt={user.username}
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 rounded-full object-cover border"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
                              {user.username.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => router.push(`/u/${user.username}`)}
                              className="font-semibold vv-link text-sm"
                            >
                              {user.username}
                            </button>
                            {user.bio && <p className="text-xs text-slate-500 mt-1 leading-5">{user.bio}</p>}
                          </div>
                        </div>

                        {currentUserId && user._id !== currentUserId && (
                          <div className="flex flex-col items-end gap-2">
                            <FollowButton
                              targetUserId={user._id}
                              isFollowing={Boolean(followState[user._id])}
                              onChange={(following) =>
                                setFollowState((prev) => ({ ...prev, [user._id]: following }))
                              }
                              onError={setMessage}
                              testId={`search-follow-${user.username}`}
                            />
                            <button
                              type="button"
                              data-testid={`search-message-${user.username}`}
                              onClick={() => openConversation(user._id)}
                              disabled={Boolean(messageBusy[user._id])}
                              className="vv-btn-secondary text-xs px-2 py-1"
                            >
                              {messageBusy[user._id] ? "Opening..." : "Message"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showPosts && (
              <div className="vv-card p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="vv-section-title">Posts</h3>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{posts.length} results</p>
                </div>

                {posts.length === 0 ? (
                  <EmptyState title="No posts found" description="Try different wording or open the topic suggestions above to narrow the claim set." />
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => (
                      <div key={post._id}>
                        {(post.hashtags || []).length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {(post.hashtags || []).map((tag) => (
                              <button
                                key={tag}
                                onClick={() => router.push(`/topics/${tag}`)}
                                className="vv-pill-blue"
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        )}

                        <PostCard
                          variant="profile-compact"
                          post={post}
                          currentUser={currentUser}
                          currentUserId={currentUserId}
                          onNavigateToProfile={(username) => router.push(`/u/${username}`)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
