"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchExpertQueue, submitExpertDecision } from "@/lib/adminClient";
import { runMutation } from "@/lib/runMutation";
import { getErrorMessage } from "@/lib/apiClient";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";

type Author = {
  _id: string;
  username: string;
  reputation?: number;
  avatarUrl?: string;
};

type ExpertPost = {
  _id: string;
  content: string;
  status: string;
  aiLabel?: string;
  aiRiskScore?: number;
  expertDecision?: string;
  verificationScore?: number | null;
  moderationReasons?: string[];
  groundingSummary?: string;
  groundingSources?: Array<{
    title: string;
    url: string;
    domain: string;
    stance: "supports" | "contradicts" | "context" | "unknown";
  }>;
  groundingConfidence?: number;
  contradictionCount?: number;
  supportCount?: number;
  hashtags?: string[];
  author: Author;
};

export default function ExpertPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    showSuccess,
    clearMessage,
  } = usePageState();

  const [posts, setPosts] = useState<ExpertPost[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingPostId, setPendingPostId] = useState("");

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const data = await fetchExpertQueue();
      setPosts(data.posts || data.queue || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load expert queue"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("expert", loadQueue);

  useEffect(() => {
    const interval = setInterval(() => {
      loadQueue();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadQueue]);

  async function reviewPost(
    postId: string,
    decision: "verified" | "false" | "disputed"
  ) {
    setPendingPostId(postId);

    await runMutation({
      action: () =>
        submitExpertDecision({
          postId,
          decision,
          note: notes[postId] || "",
        }),
      onSuccess: () => {
        setPosts((prev) => prev.filter((post) => String(post._id) !== String(postId)));
        setNotes((prev) => ({ ...prev, [postId]: "" }));
        showSuccess(`Expert decision "${decision}" submitted.`);
      },
      onError: showError,
      onFinally: () => setPendingPostId(""),
    });
  }

  return (
    <PageWrapper
      title="Expert Review Queue"
      subtitle="Review high-risk and sensitive content requiring expert judgment."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => router.push("/feed")} className="vv-btn-secondary">
          Feed
        </button>
        <button onClick={loadQueue} className="vv-btn-secondary">
          Refresh Queue
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading expert queue..." />
      ) : posts.length === 0 ? (
        <EmptyState
          title="No expert review items"
          description="High-risk posts requiring expert review will appear here."
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post._id} className="vv-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-veriverse-dark">
                    {post.author?.username}
                  </p>
                  <p className="text-xs text-slate-500">
                    Reputation: {Number(post.author?.reputation || 0)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <TrustVerdictBadge
                    status={post.status}
                    expertDecision={post.expertDecision}
                    verificationScore={post.verificationScore}
                    contradictionCount={post.contradictionCount}
                    groundingSources={post.groundingSources}
                  />
                  <span className="vv-verdict-pill vv-verdict-negative">
                    Risk {Number(post.aiRiskScore || 0)}
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-700 mb-3">{post.content}</p>

              {(post.moderationReasons ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {(post.moderationReasons ?? []).map((reason) => (
                    <span key={reason} className="vv-verdict-pill vv-verdict-negative">
                      {reason}
                    </span>
                  ))}
                </div>
              )}

              {post.groundingSummary && (
                <div className="vv-card-soft p-3 mb-3">
                  <p className="text-xs text-slate-500 mb-1">Grounding Summary</p>
                  <p className="text-sm text-slate-700 mb-2">{post.groundingSummary}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="vv-verdict-pill vv-verdict-neutral">
                      Confidence: {Number(post.groundingConfidence || 0)}
                    </span>
                    <span className="vv-verdict-pill vv-verdict-negative">
                      Contradictions: {Number(post.contradictionCount || 0)}
                    </span>
                    <span className="vv-verdict-pill vv-verdict-positive">
                      Supports: {Number(post.supportCount || 0)}
                    </span>
                  </div>
                </div>
              )}

              <textarea
                className="vv-textarea mb-3"
                rows={3}
                placeholder="Optional expert review note"
                value={notes[post._id] || ""}
                onChange={(e) =>
                  setNotes((prev) => ({
                    ...prev,
                    [post._id]: e.target.value,
                  }))
                }
              />

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => reviewPost(post._id, "verified")}
                  disabled={pendingPostId === post._id}
                  className="vv-btn-accent"
                >
                  {pendingPostId === post._id ? "Working..." : "Mark Verified"}
                </button>

                <button
                  onClick={() => reviewPost(post._id, "disputed")}
                  disabled={pendingPostId === post._id}
                  className="vv-btn-secondary"
                >
                  {pendingPostId === post._id ? "Working..." : "Mark Disputed"}
                </button>

                <button
                  onClick={() => reviewPost(post._id, "false")}
                  disabled={pendingPostId === post._id}
                  className="vv-btn-danger"
                >
                  {pendingPostId === post._id ? "Working..." : "Mark False"}
                </button>

                <button
                  onClick={() => router.push(`/posts/${post._id}`)}
                  className="vv-btn-secondary"
                >
                  Open Post
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
