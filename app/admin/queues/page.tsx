"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import { fetchAdminQueues } from "@/lib/adminClient";
import { getErrorMessage } from "@/lib/apiClient";

type PostItem = {
  _id: string;
  content: string;
  status: string;
  aiRiskScore?: number;
  moderationReasons?: string[];
  groundingSummary?: string;
  groundingConfidence?: number;
  contradictionCount?: number;
  supportCount?: number;
  author?: {
    username?: string;
    reputation?: number;
  };
};

type ReportItem = {
  _id: string;
  reason: string;
  note?: string;
  reporter?: {
    username?: string;
  };
  post?: {
    _id?: string;
    content?: string;
  };
};

type AppealItem = {
  _id: string;
  status: string;
  reason?: string;
  appellant?: {
    username?: string;
  };
  post?: {
    _id?: string;
    content?: string;
  };
};

export default function AdminQueuesPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Loading moderation queues..." />}>
      <AdminQueuesPageContent />
    </Suspense>
  );
}

function AdminQueuesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queueType = searchParams.get("queue") || "all";

  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    clearMessage,
  } = usePageState();

  const [flaggedPosts, setFlaggedPosts] = useState<PostItem[]>([]);
  const [expertReviewPosts, setExpertReviewPosts] = useState<PostItem[]>([]);
  const [reportQueue, setReportQueue] = useState<ReportItem[]>([]);
  const [appealQueue, setAppealQueue] = useState<AppealItem[]>([]);

  const loadQueues = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const data = await fetchAdminQueues(queueType);
      setFlaggedPosts(data.queues?.flaggedPosts || []);
      setExpertReviewPosts(data.queues?.expertReviewPosts || []);
      setReportQueue(data.queues?.reportQueue || []);
      setAppealQueue(data.queues?.appealQueue || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load moderation queues"));
    } finally {
      setLoading(false);
    }
  }, [queueType, setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadQueues);

  const totalItems =
    flaggedPosts.length +
    expertReviewPosts.length +
    reportQueue.length +
    appealQueue.length;

  return (
    <PageWrapper
      title="Moderation Queues"
      subtitle="Review flagged posts, reports, expert cases, and appeals."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Admin
        </button>
        <button onClick={loadQueues} className="vv-btn-secondary">
          Refresh
        </button>
        <button onClick={() => router.push("/admin/queues?queue=all")} className="vv-btn-secondary">
          All
        </button>
        <button onClick={() => router.push("/admin/queues?queue=flagged")} className="vv-btn-secondary">
          Flagged
        </button>
        <button onClick={() => router.push("/admin/queues?queue=expert")} className="vv-btn-secondary">
          Expert
        </button>
        <button onClick={() => router.push("/admin/queues?queue=reports")} className="vv-btn-secondary">
          Reports
        </button>
        <button onClick={() => router.push("/admin/queues?queue=appeals")} className="vv-btn-secondary">
          Appeals
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading queues..." />
      ) : totalItems === 0 ? (
        <EmptyState
          title="No moderation items"
          description="Nothing is currently waiting in the moderation queues."
        />
      ) : (
        <div className="space-y-6">
          {(queueType === "all" || queueType === "flagged") && (
            <div className="vv-card p-5">
              <h2 className="vv-section-title mb-4">Flagged Posts</h2>
              {flaggedPosts.length === 0 ? (
                <p className="text-sm text-slate-500">No flagged posts.</p>
              ) : (
                <div className="space-y-3">
                  {flaggedPosts.map((post) => (
                    <div key={post._id} className="vv-card-soft p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="font-medium text-veriverse-dark">
                          {post.author?.username || "Unknown"}
                        </p>
                        <span className="vv-pill-red">Risk {Number(post.aiRiskScore || 0)}</span>
                      </div>
                      <p className="mb-2 text-sm text-slate-700">{post.content}</p>
                      {post.groundingSummary ? (
                        <div className="vv-card-soft mb-2 p-3">
                          <p className="mb-1 text-xs text-slate-500">Grounded Evidence</p>
                          <p className="mb-2 text-sm text-slate-700">{post.groundingSummary}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="vv-pill-gray">
                              Confidence: {Number(post.groundingConfidence || 0)}
                            </span>
                            <span className="vv-pill-red">
                              Contradictions: {Number(post.contradictionCount || 0)}
                            </span>
                            <span className="vv-pill-green">
                              Supports: {Number(post.supportCount || 0)}
                            </span>
                          </div>
                        </div>
                      ) : null}
                      <button
                        onClick={() => router.push(`/posts/${post._id}`)}
                        className="vv-btn-secondary"
                      >
                        Open Post
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(queueType === "all" || queueType === "expert") && (
            <div className="vv-card p-5">
              <h2 className="vv-section-title mb-4">Expert Review Queue</h2>
              {expertReviewPosts.length === 0 ? (
                <p className="text-sm text-slate-500">No expert review items.</p>
              ) : (
                <div className="space-y-3">
                  {expertReviewPosts.map((post) => (
                    <div key={post._id} className="vv-card-soft p-4">
                      <p className="mb-2 font-medium text-veriverse-dark">
                        {post.author?.username || "Unknown"}
                      </p>
                      <p className="mb-3 text-sm text-slate-700">{post.content}</p>
                      <button
                        onClick={() => router.push(`/posts/${post._id}`)}
                        className="vv-btn-secondary"
                      >
                        Open Post
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(queueType === "all" || queueType === "reports") && (
            <div className="vv-card p-5">
              <h2 className="vv-section-title mb-4">Report Queue</h2>
              {reportQueue.length === 0 ? (
                <p className="text-sm text-slate-500">No pending reports.</p>
              ) : (
                <div className="space-y-3">
                  {reportQueue.map((report) => (
                    <div key={report._id} className="vv-card-soft p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="font-medium text-veriverse-dark">
                          Reporter: {report.reporter?.username || "Unknown"}
                        </p>
                        <span className="vv-pill-purple">{report.reason}</span>
                      </div>
                      {report.post?.content ? (
                        <p className="mb-3 text-sm text-slate-700">{report.post.content}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => router.push("/admin")}
                          className="vv-btn-secondary"
                        >
                          Open Reports Area
                        </button>
                        {report.post?._id ? (
                          <button
                            onClick={() => router.push(`/posts/${report.post?._id}`)}
                            className="vv-btn-secondary"
                          >
                            Open Post
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(queueType === "all" || queueType === "appeals") && (
            <div className="vv-card p-5">
              <h2 className="vv-section-title mb-4">Appeals Queue</h2>
              {appealQueue.length === 0 ? (
                <p className="text-sm text-slate-500">No pending appeals.</p>
              ) : (
                <div className="space-y-3">
                  {appealQueue.map((appeal) => (
                    <div key={appeal._id} className="vv-card-soft p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="font-medium text-veriverse-dark">
                          Appellant: {appeal.appellant?.username || "Unknown"}
                        </p>
                        <span className="vv-pill-purple">{appeal.status}</span>
                      </div>
                      {appeal.post?.content ? (
                        <p className="mb-2 text-sm text-slate-700">{appeal.post.content}</p>
                      ) : null}
                      {appeal.reason ? (
                        <p className="mb-3 text-sm text-slate-600">{appeal.reason}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => router.push("/admin/appeals")}
                          className="vv-btn-secondary"
                        >
                          Review Appeal
                        </button>
                        {appeal.post?._id ? (
                          <button
                            onClick={() => router.push(`/posts/${appeal.post?._id}`)}
                            className="vv-btn-secondary"
                          >
                            Open Post
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
