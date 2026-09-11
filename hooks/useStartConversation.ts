"use client";

// hooks/useStartConversation.ts
// P2.8: the "message this person" flow (POST /messages/conversations then
// route to the created/existing thread) was independently re-implemented
// in app/u/[username]/page.tsx (via the shared `api` client) and
// app/search/page.tsx (via a raw `axios.post` bypassing `api`'s bearer-
// token interceptor). Both did the same two steps with slightly different
// error handling. This hook owns exactly those two steps and nothing else -
// it deliberately does NOT own busy state, since the profile page uses a
// single boolean while Search needs a per-row busy map; each caller keeps
// managing its own busy state exactly as before around this call.
import { useRouter } from "next/navigation";
import { api, getErrorMessage } from "@/lib/apiClient";

export function useStartConversation() {
  const router = useRouter();

  return async function startConversation(targetUserId: string): Promise<string | null> {
    try {
      const res = await api.post("/messages/conversations", { targetUserId });
      router.push(`/messages/${res.data.conversation._id}`);
      return null;
    } catch (error: any) {
      return getErrorMessage(error, "Failed to start conversation");
    }
  };
}
