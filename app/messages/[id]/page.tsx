"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import MessageBubble from "@/components/MessageBubble";
import MessageComposer from "@/components/MessageComposer";
import { usePageState } from "@/hooks/usePageState";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { api, getErrorMessage } from "@/lib/apiClient";

const POLL_INTERVAL_MS = 12_000;

type MessageItem = {
  _id: string;
  sender: string;
  content: string;
  createdAt: string;
};

type Counterpart = {
  _id: string;
  username: string;
  avatarUrl?: string;
  reputation: number;
};

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showError, clearMessage } = usePageState();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [counterpart, setCounterpart] = useState<Counterpart | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const conversationIdRef = useRef<string>("");
  const fetchingRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);

  const fetchConversation = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) {
        return;
      }
      setCurrentUserId(String(user._id));

      const resolvedParams = await params;
      conversationIdRef.current = resolvedParams.id;

      const res = await api.get(`/messages/conversations/${resolvedParams.id}`);
      const fetchedMessages: MessageItem[] = res.data.messages || [];
      setCounterpart(res.data.counterpart || null);
      setMessages(fetchedMessages);
      lastMessageIdRef.current = fetchedMessages.length
        ? fetchedMessages[fetchedMessages.length - 1]._id
        : null;
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load conversation"));
    } finally {
      setLoading(false);
    }
  }, [clearMessage, params, router, setLoading, showError]);

  const refreshMessages = useCallback(async (viewerId: string | null) => {
    if (!conversationIdRef.current || fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const res = await api.get(`/messages/conversations/${conversationIdRef.current}`);
      const fetchedMessages: MessageItem[] = res.data.messages || [];
      setCounterpart(res.data.counterpart || null);
      setMessages(fetchedMessages);

      const latest = fetchedMessages[fetchedMessages.length - 1];
      // Only announce a poll-discovered message that's new since the last
      // check and not the viewer's own (their own send already appends
      // locally and doesn't need a second, delayed announcement).
      if (latest && latest._id !== lastMessageIdRef.current && String(latest.sender) !== String(viewerId)) {
        setAnnouncement(`New message: ${latest.content}`);
      }
      lastMessageIdRef.current = latest ? latest._id : null;
    } catch {
      // Silent - a failed background refresh shouldn't disrupt an open conversation.
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void refreshMessages(currentUserId);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [refreshMessages, currentUserId]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending) {
      return;
    }

    setSending(true);
    clearMessage();

    try {
      const res = await api.post(`/messages/conversations/${conversationIdRef.current}`, {
        content,
      });
      setMessages((prev) => [...prev, res.data.message]);
      lastMessageIdRef.current = res.data.message._id;
      setDraft("");
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to send message"));
    } finally {
      setSending(false);
    }
  };

  return (
    <PageWrapper
      title={counterpart ? counterpart.username : "Conversation"}
      subtitle="Direct messages are private between you and this user."
    >
      {message && <Toast message={message} type={messageType} />}

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {loading ? (
        <LoadingSpinner label="Loading conversation..." />
      ) : (
        <div className="vv-card p-4 sm:p-5 flex flex-col gap-4">
          {counterpart && (
            <div className="flex items-center gap-2 border-b border-black/5 pb-3">
              {counterpart.avatarUrl ? (
                <img
                  src={counterpart.avatarUrl}
                  alt={counterpart.username}
                  className="h-8 w-8 rounded-full object-cover border"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
                  {counterpart.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <p className="text-sm font-semibold text-veriverse-dark">{counterpart.username}</p>
            </div>
          )}

          <div
            className="flex flex-col max-h-[60vh] overflow-y-auto"
            data-testid="message-history"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet. Say hello.</p>
            ) : (
              messages.map((item, index) => {
                const mine = String(item.sender) === String(currentUserId);
                const previous = messages[index - 1];
                const grouped = Boolean(previous && String(previous.sender) === String(item.sender));
                return (
                  <MessageBubble
                    key={item._id}
                    content={item.content}
                    createdAt={item.createdAt}
                    mine={mine}
                    grouped={grouped}
                  />
                );
              })
            )}
          </div>

          <MessageComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void sendMessage()}
            submitting={sending}
          />
        </div>
      )}
    </PageWrapper>
  );
}
