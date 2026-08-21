"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";
import { api, getErrorMessage } from "@/lib/apiClient";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";

type Post = {
  _id: string;
  content: string;
  status: string;
  expertDecision?: string;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: Array<{
    stance: "supports" | "contradicts" | "context" | "unknown";
  }>;
  author: {
    username: string;
    reputation?: number;
  };
};

type SavedItem = {
  _id: string;
  post: Post;
};

export default function SavedPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } =
    usePageState();
  const [items, setItems] = useState<SavedItem[]>([]);

  useEffect(() => {
    void loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSaved() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const res = await api.get("/saved");
      setItems((res.data.saved || []).filter((item: SavedItem) => item.post));
    } catch (error: unknown) {
      showError(getErrorMessage(error, "Failed to load saved posts"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper
      title="Saved Posts"
      subtitle="Claims you've bookmarked to revisit or track through review."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading saved posts..." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No saved posts"
          description="Save a claim from the feed to keep track of it here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item._id} className="vv-card p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => router.push(`/u/${item.post.author?.username}`)}
                  className="vv-link text-sm font-semibold"
                >
                  {item.post.author?.username}
                </button>
                <TrustVerdictBadge
                  status={item.post.status}
                  expertDecision={item.post.expertDecision}
                  verificationScore={item.post.verificationScore}
                  contradictionCount={item.post.contradictionCount}
                  groundingSources={item.post.groundingSources}
                />
              </div>
              <button
                onClick={() => router.push(`/posts/${item.post._id}`)}
                className="text-left text-sm leading-6 text-slate-700 hover:text-veriverse-dark"
              >
                {item.post.content}
              </button>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
