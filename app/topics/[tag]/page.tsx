"use client";

import { use, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";

type Author = {
  _id: string;
  username: string;
  reputation: number;
  avatarUrl?: string;
};

type Post = {
  _id: string;
  content: string;
  status: string;
  hashtags?: string[];
  author: Author;
};

export default function TopicPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const router = useRouter();
  const { tag } = use(params);
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    axios
      .get(`/api/topics/${tag}`)
      .then((res) => {
        if (cancelled) {
          return;
        }

        setPosts(res.data.posts || []);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error)) {
          setMessage(error.response?.data?.message || "Failed to load topic");
          return;
        }

        setMessage("Failed to load topic");
      });

    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <PageWrapper
      title={`#${tag || "Topic"}`}
      subtitle="Trace every claim connected to this topic and move directly into the detailed verification flow."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="vv-post-panel-accent max-w-2xl">
          <p className="vv-post-action-title">Topic Lens</p>
          <p className="text-sm leading-6 text-slate-700">
            Posts here inherit the same verification workflow as the feed, with faster paths into evidence and discussion.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.push("/search")} className="vv-btn-secondary">Search</button>
          <button onClick={() => router.push("/feed")} className="vv-btn-secondary">Feed</button>
        </div>
      </div>

      {message && <Toast message={message} type="error" />}

      <div className="space-y-4 mt-4">
        {posts.length === 0 ? (
          <EmptyState
            title="No posts for this topic"
            description="Try a broader search term or check the main feed for emerging claims."
          />
        ) : (
          posts.map((post) => (
            <div key={post._id} className="vv-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => router.push(`/u/${post.author?.username}`)}
                    className="font-medium vv-link text-sm"
                  >
                    {post.author?.username}
                  </button>

                  <p className="my-3 text-sm leading-7 text-slate-800 sm:text-[15px]">{post.content}</p>

                  <div className="flex flex-wrap gap-2">
                    {(post.hashtags || []).map((item) => (
                      <button
                        key={item}
                        onClick={() => router.push(`/topics/${item}`)}
                        className={item === tag ? "vv-pill-purple" : "vv-pill-blue"}
                      >
                        #{item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-full sm:max-w-xs">
                  <div className="vv-post-action-cluster">
                    <p className="vv-post-action-title">Open Verification</p>
                    <div className="vv-post-action-grid xl:grid-cols-2">
                      <button
                        onClick={() => router.push(`/posts/${post._id}`)}
                        className="vv-post-action-button vv-post-action-strong"
                      >
                        <span>View Post</span>
                        <span>→</span>
                      </button>
                      <button
                        onClick={() => router.push(`/topics/${tag}`)}
                        className="vv-post-action-button"
                      >
                        <span>Stay In Topic</span>
                        <span>#</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-3">
                      Status: {post.status}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
}
