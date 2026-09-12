// components/ClaimFollowButton.tsx
// P3.3: deliberately separate from components/FollowButton.tsx, not a
// generalization of it - person-Follow is a toggle over POST /api/follow;
// ClaimFollow's mutations are ensure-follow (POST) / ensure-unfollow
// (DELETE), since it's the durable subscription relation P3.4's
// notification fanout will read from and must stay idempotent under
// ordinary retries. Interaction language (controlled isFollowing prop,
// local busy state, aria-pressed, vv-btn-primary/secondary styling,
// "Following"/"..." states) mirrors FollowButton's for consistency.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, getErrorMessage } from "@/lib/apiClient";

type Props = {
  claimId: string;
  isFollowing: boolean;
  isLoggedIn: boolean;
  onChange?: (following: boolean) => void;
  onError?: (message: string) => void;
  testId?: string;
  className?: string;
};

export default function ClaimFollowButton({
  claimId,
  isFollowing,
  isLoggedIn,
  onChange,
  onError,
  testId,
  className = "",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;

    if (!isLoggedIn) {
      // The login flow does not currently support a return/next parameter
      // (confirmed by inspection - no such system exists in app/login), so
      // this does not attempt to build one. Simply routes to /login.
      router.push("/login");
      return;
    }

    setBusy(true);
    try {
      const res = isFollowing
        ? await api.delete(`/claims/${claimId}/follow`)
        : await api.post(`/claims/${claimId}/follow`);
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
      onClick={handleClick}
      disabled={busy}
      aria-pressed={isLoggedIn ? isFollowing : false}
      className={`${isFollowing ? "vv-btn-secondary" : "vv-btn-primary"} ${className}`}
    >
      {busy ? "..." : isFollowing ? "Following" : "Follow claim"}
    </button>
  );
}
