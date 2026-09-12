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
// How close to the bottom (in pixels) counts as "already reading the
// latest" for the purposes of auto-pinning a newly-polled message. Modest
// on purpose - this never needs pixel-exact bottom alignment, just "close
// enough that yanking them to the true bottom wouldn't be a surprise."
const NEAR_BOTTOM_THRESHOLD_PX = 80;

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
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const conversationIdRef = useRef<string>("");
  const fetchingRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  // Which conversation the one-time initial "jump to latest" has already
  // run for - reset naturally whenever this changes to a new id, so
  // navigating between conversations doesn't carry over the previous
  // thread's "already scrolled" state.
  const initialScrollDoneForRef = useRef<string | null>(null);

  // Two independent scroll contexts need moving, not one: the inner
  // message-history box (its own overflow-y-auto, so the latest bubble is
  // the one showing) and the outer page itself (a mobile-width page is
  // often barely taller than the viewport, so without this the composer -
  // which sits below the history box in normal document flow - stays
  // scrolled behind the fixed bottom nav even once the history box is
  // showing the latest message). Both are scrolled to their true maximum,
  // not an estimated offset - AppShell's own pb-20 already reserves space
  // below the last real content specifically so the fixed nav lands over
  // that padding, not over the composer, once the page is at its bottom.
  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const container = historyRef.current;
    if (container) {
      if (behavior === "smooth") {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }

    if (typeof window !== "undefined") {
      const top = document.documentElement.scrollHeight;
      if (behavior === "smooth") {
        window.scrollTo({ top, behavior: "smooth" });
      } else {
        window.scrollTo(0, top);
      }
    }
  }, []);

  const isNearBottom = useCallback(() => {
    const container = historyRef.current;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      NEAR_BOTTOM_THRESHOLD_PX
    );
  }, []);

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

  const refreshMessages = useCallback(
    async (viewerId: string | null) => {
      if (!conversationIdRef.current || fetchingRef.current) return;
      fetchingRef.current = true;

      // Measured before the update - once new bubbles render, scrollHeight
      // grows and "was I at the bottom" can no longer be answered from the
      // post-update DOM.
      const wasNearBottom = isNearBottom();

      try {
        const res = await api.get(`/messages/conversations/${conversationIdRef.current}`);
        const fetchedMessages: MessageItem[] = res.data.messages || [];
        setCounterpart(res.data.counterpart || null);
        setMessages(fetchedMessages);

        const latest = fetchedMessages[fetchedMessages.length - 1];
        const isGenuinelyNew = Boolean(latest && latest._id !== lastMessageIdRef.current);
        const isFromOther = isGenuinelyNew && String(latest.sender) !== String(viewerId);

        // Only announce a poll-discovered message that's new since the last
        // check and not the viewer's own (their own send already appends
        // locally and doesn't need a second, delayed announcement).
        if (isFromOther) {
          setAnnouncement(`New message: ${latest.content}`);
        }

        if (isGenuinelyNew) {
          if (wasNearBottom) {
            // Already reading the latest - keep them pinned to it rather
            // than making them notice and scroll manually every time.
            requestAnimationFrame(() => scrollToBottom("smooth"));
            setHasNewMessages(false);
          } else if (isFromOther) {
            // Deliberately scrolled up to read older messages - don't yank
            // them down; let them know there's something new instead.
            setHasNewMessages(true);
          }
        }

        lastMessageIdRef.current = latest ? latest._id : null;
      } catch {
        // Silent - a failed background refresh shouldn't disrupt an open conversation.
      } finally {
        fetchingRef.current = false;
      }
    },
    [isNearBottom, scrollToBottom]
  );

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  // Initial "jump to latest" - once per conversation, right after its
  // history has loaded. Guarded so background polling updates (which also
  // change `messages`) never re-trigger this.
  useEffect(() => {
    if (loading) return;
    if (!conversationIdRef.current) return;
    if (initialScrollDoneForRef.current === conversationIdRef.current) return;
    initialScrollDoneForRef.current = conversationIdRef.current;

    if (messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom("auto"));
    }
  }, [loading, messages, scrollToBottom]);

  // Clears the "New messages" affordance if the user scrolls back down to
  // the latest message on their own, without tapping it.
  useEffect(() => {
    const container = historyRef.current;
    if (!container || !hasNewMessages) return;

    const handleScroll = () => {
      if (isNearBottom()) setHasNewMessages(false);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasNewMessages, isNearBottom]);

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
      setHasNewMessages(false);
      requestAnimationFrame(() => scrollToBottom("smooth"));
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

          <div className="relative">
            <div
              ref={historyRef}
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

            {hasNewMessages && (
              <button
                type="button"
                onClick={() => {
                  scrollToBottom("smooth");
                  setHasNewMessages(false);
                }}
                className="vv-btn-secondary absolute bottom-2 left-1/2 -translate-x-1/2 shadow-md"
              >
                New messages
              </button>
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
