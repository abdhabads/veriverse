// components/ProfileStats.tsx
// P2.5: the "Contribution" section of a profile - reputation, reward
// points, and badges, normalized to one presentation shared by own and
// public profile (own profile previously showed badges only as a bare
// count; this shows actual badge names on both, matching what public
// profile already did). Deliberately three distinct, separately-labelled
// measures rather than one blended "trust" number - see ReputationInfo's
// own disclosure text, which this keeps using unchanged.
import ReputationInfo from "@/components/ReputationInfo";

type Contribution = {
  posts: number;
  claims: number;
  expertReviews?: number;
};

type Props = {
  reputation: number;
  rewardPoints: number;
  badges: string[];
  // P3.7: only the account owner should see a path into their own private
  // reputation history (app/reputation/page.tsx) - omitted entirely by
  // app/u/[username]/page.tsx (public profile), so another user's page can
  // never render this link.
  onViewHistory?: () => void;
  // P3.8: descriptive authorship-volume counts, deliberately rendered as a
  // small subordinate row (not another pair of large tiles) so the profile
  // doesn't start reading as an analytics dashboard. `expertReviews` is
  // only present (and only rendered) for a Verified Expert - its absence,
  // not a zero value, is what keeps it off an ordinary profile.
  contribution?: Contribution;
};

export default function ProfileStats({
  reputation,
  rewardPoints,
  badges,
  onViewHistory,
  contribution,
}: Props) {
  return (
    <div className="vv-card p-5" data-testid="profile-stats">
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="vv-card-soft p-3">
          <p className="text-xs text-slate-500">Reputation</p>
          <p className="text-xl font-semibold text-veriverse-dark">{Number(reputation || 0)}</p>
          <ReputationInfo className="mt-1" />
          {onViewHistory && (
            <button type="button" onClick={onViewHistory} className="vv-link mt-1 block text-xs">
              View reputation history
            </button>
          )}
        </div>

        <div className="vv-card-soft p-3">
          <p className="text-xs text-slate-500">Reward Points</p>
          <p className="text-xl font-semibold text-veriverse-dark">{Number(rewardPoints || 0)}</p>
          <p className="mt-1 text-xs text-slate-500">Points earned through platform contribution.</p>
        </div>
      </div>

      {contribution && (
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>
            Posts <strong className="text-veriverse-dark">{Number(contribution.posts || 0)}</strong>
          </span>
          <span title="Distinct Claims linked from this user's Posts">
            Claims <strong className="text-veriverse-dark">{Number(contribution.claims || 0)}</strong>
          </span>
          {contribution.expertReviews !== undefined && (
            <span title="Completed Post-scoped expert reviews">
              Expert Reviews{" "}
              <strong className="text-veriverse-dark">{Number(contribution.expertReviews || 0)}</strong>
            </span>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs text-slate-500">Badges</p>
        {badges.length === 0 ? (
          <p className="text-sm text-slate-500">No badges yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span key={badge} className="vv-pill-blue">
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
