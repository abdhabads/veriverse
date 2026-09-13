// components/ExpertCard.tsx
//
// P3.6: intentionally shows only identity/discovery fields (avatar,
// username, Verified Expert badge, domain(s), a short credential summary,
// Follow, profile navigation) - never a trust level, truth score, or
// reputation-derived rank. Message is profile-only, not here, matching the
// audit's decision to keep this card to one primary action plus navigation
// (the same restraint TrendingClaimCard already applies).
import Link from "next/link";
import ExpertBadge from "@/components/ExpertBadge";
import FollowButton from "@/components/FollowButton";
import { EXPERTISE_DOMAIN_LABELS } from "@/lib/expertiseDomains";

export type Expert = {
  id: string;
  username: string;
  avatarUrl?: string;
  bio: string;
  expertise: { domain: string; label: string }[];
  credentialSummary: string;
  follow: { isFollowing: boolean };
};

type Props = {
  expert: Expert;
  isLoggedIn: boolean;
  onFollowChange?: (expertId: string, following: boolean) => void;
  onFollowError?: (message: string) => void;
};

export default function ExpertCard({ expert, isLoggedIn, onFollowChange, onFollowError }: Props) {
  const domains = expert.expertise.map((item) => item.domain);

  return (
    <div className="vv-post-panel">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/u/${expert.username}`} className="flex min-w-0 flex-1 items-start gap-3">
          {expert.avatarUrl ? (
            <img
              src={expert.avatarUrl}
              alt={expert.username}
              className="h-10 w-10 shrink-0 rounded-full border border-veriverse-border object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-veriverse-border bg-veriverse-slate text-xs text-veriverse-dark/60">
              {expert.username.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-veriverse-dark">{expert.username}</p>
            <div className="mt-1">
              <ExpertBadge domains={domains} domainLabels={EXPERTISE_DOMAIN_LABELS} />
            </div>
          </div>
        </Link>

        {isLoggedIn && (
          <FollowButton
            targetUserId={expert.id}
            isFollowing={expert.follow.isFollowing}
            onChange={(following) => onFollowChange?.(expert.id, following)}
            onError={onFollowError}
            testId={`expert-follow-${expert.id}`}
          />
        )}
      </div>

      {expert.credentialSummary && (
        <p className="mt-3 text-xs leading-5 text-slate-600">{expert.credentialSummary}</p>
      )}
    </div>
  );
}
