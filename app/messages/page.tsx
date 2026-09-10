"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { api, getErrorMessage } from "@/lib/apiClient";

const POLL_INTERVAL_MS = 30_000;

type Conversation = {
  _id: string;
  counterpart: {
    _id: string;
    username: string;
    avatarUrl?: string;
    reputation: number;
  } | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastReadAt: string | null;
  isUnread: boolean;
};

export default function MessagesPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } = usePageState();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const fetchingRef = useRef(false);

  const fetchConversations = useCallback(
    async (silent: boolean) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        if (!silent) {
          setLoading(true);
          clearMessage();

          const user = await requireAuthenticated(router);
          if (!user) {
            return;
          }
        }

        const res = await api.get("/messages/conversations");
        setConversations(res.data.conversations || []);
      } catch (error: any) {
        if (!silent) {
          showError(getErrorMessage(error, "Failed to load conversations"));
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
        fetchingRef.current = false;
      }
    },
    [clearMessage, router, setLoading, showError]
  );

  useEffect(() => {
    void fetchConversations(false);

    const intervalId = setInterval(() => {
      void fetchConversations(true);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [fetchConversations]);

  return (
    <PageWrapper
      title="Messages"
      subtitle="Direct conversations with people you've messaged or who have messaged you."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading conversations..." />
      ) : conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Start a conversation from someone's profile to see it here."
        />
      ) : (
        <div className="vv-card p-4 sm:p-5">
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <button
                key={conversation._id}
                type="button"
                data-testid={`conversation-${conversation.counterpart?.username || conversation._id}`}
                data-unread={conversation.isUnread ? "true" : "false"}
                onClick={() => router.push(`/messages/${conversation._id}`)}
                className={`vv-post-panel w-full text-left flex items-center gap-3 ${
                  conversation.isUnread ? "border-veriverse-purple/50" : ""
                }`}
              >
                {conversation.isUnread && (
                  <span
                    aria-label="Unread"
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-veriverse-purple"
                  />
                )}

                {conversation.counterpart?.avatarUrl ? (
                  <img
                    src={conversation.counterpart.avatarUrl}
                    alt={conversation.counterpart.username}
                    className="w-10 h-10 rounded-full object-cover border"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
                    {(conversation.counterpart?.username || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${conversation.isUnread ? "font-bold" : "font-semibold"}`}>
                    {conversation.counterpart?.username || "Unknown user"}
                  </p>
                  <p
                    className={`text-sm truncate ${
                      conversation.isUnread ? "text-slate-800 font-medium" : "text-slate-500"
                    }`}
                  >
                    {conversation.lastMessagePreview || "No messages yet"}
                  </p>
                </div>

                {conversation.lastMessageAt && (
                  <p className="text-xs text-slate-400 whitespace-nowrap">
                    {new Date(conversation.lastMessageAt).toLocaleString()}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
