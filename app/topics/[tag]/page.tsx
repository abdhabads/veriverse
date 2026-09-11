"use client";

import { use, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import PostCard, { type Post as PostCardPost } from "@/components/PostCard";

export default function TopicPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const router = useRouter();
  const { tag } = use(params);
  const [posts, setPosts] = useState<PostCardPost[]>([]);
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
            <div key={post._id}>
              {(post.hashtags || []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
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
              )}

              <PostCard
                variant="profile-compact"
                post={post}
                currentUser={null}
                onNavigateToProfile={(username) => router.push(`/u/${username}`)}
              />
            </div>
          ))
        )}
      </div>
    </PageWrapper>
  );
}
