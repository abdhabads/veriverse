"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { api, getErrorMessage } from "@/lib/apiClient";

type Notification = {
  _id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  referencePost?: string | null;
};

export default function NotificationsPage() {
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
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) {
        return;
      }

      const res = await api.get("/notifications");
      setNotifications(res.data.notifications || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  }, [clearMessage, router, setLoading, showError]);

  useEffect(() => {
    void fetchNotifications();

    const intervalId = setInterval(() => {
      void fetchNotifications();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api.patch("/notifications");
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      showSuccess("All notifications marked as read");
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to update notifications"));
    }
  };

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <PageWrapper title="Notifications" subtitle="Stay updated on votes, reviews, moderation, and account activity.">
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="vv-card-soft px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Unread</p>
          <p className="text-2xl font-bold text-veriverse-dark">{unreadCount}</p>
        </div>
        <button
          onClick={markAllRead}
          disabled={notifications.length === 0 || unreadCount === 0}
          className="vv-btn-secondary"
        >
          Mark all as read
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading notifications..." />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Activity about your posts, comments, appeals, and moderation actions will appear here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item._id}
              className={`vv-card p-4 ${item.isRead ? "" : "border-l-4 border-l-veriverse-purple"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-sm font-medium text-veriverse-dark">{item.message}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    {item.type.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>

                {item.referencePost ? (
                  <button
                    onClick={() => router.push(`/posts/${item.referencePost}`)}
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
    </PageWrapper>
  );
}