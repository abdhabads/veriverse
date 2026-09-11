// components/FollowButton.tsx
// P2.5: the one canonical Follow control, replacing three independent
// implementations that previously lived in app/u/[username]/page.tsx,
// app/profile/page.tsx's "Who to Follow" suggestions, and
// components/FollowListPage.tsx - all three called the same POST /api/follow
// with the same target-id semantics and rendered the same Follow/Following
// button states, just via separately-written state/handler code each time.
//
// `isFollowing` is a controlled prop rather than something this component
// fetches itself - callers that already know the state (FollowListPage's
// batched GET /api/follow, or a suggestion that is by definition not yet
// followed) pass it straight in, so plugging this into an existing list
// never adds a new per-row request. Only the in-flight POST itself is
// local state, matching the existing local-state model (no global store).
"use client";

import { useState } from "react";
import { api, getErrorMessage } from "@/lib/apiClient";

type Props = {
  targetUserId: string;
  isFollowing: boolean;
  onChange?: (following: boolean) => void;
  onError?: (message: string) => void;
  testId?: string;
  className?: string;
};

export default function FollowButton({
  targetUserId,
  isFollowing,
  onChange,
  onError,
  testId,
  className = "",
}: Props) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post("/follow", { targetUserId });
      onChange?.(Boolean(res.data?.following));
    } catch (error: any) {
      onError?.(getErrorMessage(error, "Failed to update follow status"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={toggle}
      disabled={busy}
      aria-pressed={isFollowing}
      className={`${isFollowing ? "vv-btn-secondary" : "vv-btn-primary"} ${className}`}
    >
      {busy ? "..." : isFollowing ? "Following" : "Follow"}
    </button>
  );
}
