// components/UserListItem.tsx
// P2.5: shared person-row anatomy (avatar -> username -> reputation/social
// context -> FollowButton), replacing the separately-written row markup
// that used to live in components/FollowListPage.tsx and app/profile/
// page.tsx's "Who to Follow" widget.
"use client";

import { useRouter } from "next/navigation";
import FollowButton from "@/components/FollowButton";

type ListUser = {
  _id: string;
  username: string;
  avatarUrl?: string;
  reputation: number;
};

type Props = {
  user: ListUser;
  // Omit (or leave undefined) to render no Follow control at all - used for
  // the viewer's own row in a followers/following list.
  isFollowing?: boolean;
  onFollowChange?: (userId: string, following: boolean) => void;
  onFollowError?: (message: string) => void;
  followsYou?: boolean;
  followTestId?: string;
};

export default function UserListItem({
  user,
  isFollowing,
  onFollowChange,
  onFollowError,
  followsYou = false,
  followTestId,
}: Props) {
  const router = useRouter();

  return (
    <div className="vv-post-panel flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => router.push(`/u/${user.username}`)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-10 h-10 rounded-full object-cover border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-200 border flex items-center justify-center text-xs text-slate-500">
            {user.username.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-sm vv-link">{user.username}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">Reputation: {user.reputation}</p>
            {followsYou && <span className="vv-pill-gray text-[10px]">Follows you</span>}
          </div>
        </div>
      </button>

      {isFollowing !== undefined && (
        <FollowButton
          targetUserId={user._id}
          isFollowing={isFollowing}
          onChange={(following) => onFollowChange?.(user._id, following)}
          onError={onFollowError}
          testId={followTestId}
        />
      )}
    </div>
  );
}
