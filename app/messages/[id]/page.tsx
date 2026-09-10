"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { api, getErrorMessage } from "@/lib/apiClient";

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
  const conversationIdRef = useRef<string>("");

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
      setCounterpart(res.data.counterpart || null);
      setMessages(res.data.messages || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load conversation"));
    } finally {
      setLoading(false);
    }
  }, [clearMessage, params, router, setLoading, showError]);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

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

      {loading ? (
        <LoadingSpinner label="Loading conversation..." />
      ) : (
        <div className="vv-card p-4 sm:p-5 flex flex-col gap-4">
          <div
            className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto"
            data-testid="message-history"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet. Say hello.</p>
            ) : (
              messages.map((item) => {
                const mine = String(item.sender) === String(currentUserId);
                return (
                  <div
                    key={item._id}
                    data-testid="message-bubble"
                    data-mine={mine ? "true" : "false"}
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      mine
                        ? "self-end bg-veriverse-purple text-white"
                        : "self-start bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{item.content}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-2">
            <input
              className="vv-input flex-1"
              placeholder="Write a message"
              value={draft}
              disabled={sending}
              data-testid="message-input"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <button
              type="button"
              className="vv-btn-primary"
              disabled={sending || !draft.trim()}
              data-testid="message-send"
              onClick={() => void sendMessage()}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
