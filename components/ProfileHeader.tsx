// components/ProfileHeader.tsx
// P2.5: one shared identity hierarchy (avatar -> username -> bio -> social
// counts) for both own and public profile, replacing two independently
// laid-out headers that disagreed on avatar size, put Bio in a disconnected
// second card on own profile, and showed operational account metadata
// (email, raw role, moderation status) as if it were part of a person's
// social identity. `actions` is the only place the two variants differ -
// own profile passes a single "Edit Profile" button, public profile passes
// the Follow/Message/safety row - everything else here is identical.
"use client";

import type { ReactNode } from "react";

type Props = {
  username: string;
  avatarUrl?: string;
  bio?: string;
  bioFallback: string;
  followerCount?: number;
  followingCount?: number;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
  actions?: ReactNode;
};

export default function ProfileHeader({
  username,
  avatarUrl,
  bio,
  bioFallback,
  followerCount,
  followingCount,
  onFollowersClick,
  onFollowingClick,
  actions,
}: Props) {
  return (
    <div className="vv-card p-6">
      <div className="mb-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              className="h-16 w-16 rounded-full border border-veriverse-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-veriverse-border bg-veriverse-slate text-sm text-veriverse-dark/60">
              {username.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div>
            <h2 className="text-2xl font-semibold text-veriverse-dark">{username}</h2>
            {followerCount != null && followingCount != null && (
              <p className="vv-subtitle mt-1">
                <button
                  type="button"
                  data-testid="followers-count-link"
                  onClick={onFollowersClick}
                  className="vv-link"
                >
                  {followerCount} Followers
                </button>
                {" · "}
                <button
                  type="button"
                  data-testid="following-count-link"
                  onClick={onFollowingClick}
                  className="vv-link"
                >
                  {followingCount} Following
                </button>
              </p>
            )}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <div className="vv-post-panel">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-veriverse-dark/50">
          Bio
        </p>
        {bio ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{bio}</p>
        ) : (
          <p className="text-sm text-slate-500">{bioFallback}</p>
        )}
      </div>
    </div>
  );
}
