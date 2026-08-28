"use client";

import { useEffect, useState, Suspense } from "react";
import axios from "axios";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import PageWrapper from "@/components/PageWrapper";
import Toast from "@/components/Toast";
import ActionIcon from "@/components/ActionIcons";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";

type User = {
  _id: string;
  username: string;
  reputation: number;
  rewardPoints: number;
  avatarUrl?: string;
  badges?: string[];
  bio?: string;
};

type Author = {
  _id: string;
  username: string;
  reputation: number;
  avatarUrl?: string;
  badges?: string[];
};

type GroundingSource = {
  stance: "supports" | "contradicts" | "context" | "unknown";
};

type Post = {
  _id: string;
  content: string;
  status: string;
  hashtags?: string[];
  author: Author;
  expertDecision?: string;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: GroundingSource[];
  contentType?: "claim" | "question" | "instruction" | "rhetorical_claim";
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
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const t = searchParams.get("type") || "all";
    let cancelled = false;

    queueMicrotask(() => {
      setQuery(q);
      setType(t);

      if (!q) {
        setUsers([]);
        setPosts([]);
        setHashtags([]);
      }
    });

    if (q) {
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
        });
    }

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const submitSearch = () => {
    router.push(`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
  };

  return (
    <PageWrapper
      title="Search"
      subtitle="Find people, claims, and topics, then move directly into the verification surfaces without dropping context."
    >
      <div className="vv-card p-4 sm:p-5 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <input
            className="vv-input flex-1"
            placeholder="Search users, posts, or topics"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <select
            className="vv-select w-full lg:w-[180px]"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All</option>
            <option value="users">Users</option>
            <option value="posts">Posts</option>
          </select>

          <button
            onClick={submitSearch}
            className="vv-btn-primary w-full lg:w-auto"
          >
            Search
          </button>
        </div>
      </div>

      {message && <Toast message={message} type="error" />}

      {hashtags.length > 0 && (
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
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
                <div key={user._id} className="vv-post-panel">
                  <div className="flex items-start gap-3">
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
                        onClick={() => router.push(`/u/${user.username}`)}
                        className="font-semibold vv-link text-sm"
                      >
                        {user.username}
                      </button>
                      <p className="vv-subtitle mt-1">
                        Reputation: {user.reputation} • Rewards: {user.rewardPoints}
                      </p>
                      {user.bio && <p className="text-sm text-slate-700 mt-3 leading-6">{user.bio}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
                <div key={post._id} className="vv-post-panel-accent">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => router.push(`/u/${post.author?.username}`)}
                      className="font-medium vv-link text-sm"
                    >
                      {post.author?.username}
                    </button>
                    <TrustVerdictBadge
                      status={post.status}
                      expertDecision={post.expertDecision}
                      verificationScore={post.verificationScore}
                      contradictionCount={post.contradictionCount}
                      groundingSources={post.groundingSources}
                      contentType={post.contentType}
                    />
                  </div>

                  <p className="text-sm text-slate-700 my-3 leading-7">{post.content}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
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

                  <div className="vv-post-action-cluster">
                    <p className="vv-post-action-title">Verification Path</p>
                    <div className="vv-post-action-grid xl:grid-cols-2">
                      <button
                        onClick={() => router.push(`/posts/${post._id}`)}
                        className="vv-post-action-button vv-post-action-strong"
                      >
                        <span>View Post</span>
                        <ActionIcon name="arrowRight" />
                      </button>
                      <button
                        onClick={() => router.push(`/topics/${post.hashtags?.[0] || ""}`)}
                        disabled={!post.hashtags?.length}
                        className="vv-post-action-button"
                      >
                        <span>Open Topic</span>
                        <span>#</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
