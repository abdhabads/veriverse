// components/ProfileStats.tsx
// P2.5: the "Contribution" section of a profile - reputation, reward
// points, and badges, normalized to one presentation shared by own and
// public profile (own profile previously showed badges only as a bare
// count; this shows actual badge names on both, matching what public
// profile already did). Deliberately three distinct, separately-labelled
// measures rather than one blended "trust" number - see ReputationInfo's
// own disclosure text, which this keeps using unchanged.
import ReputationInfo from "@/components/ReputationInfo";

type Props = {
  reputation: number;
  rewardPoints: number;
  badges: string[];
};

export default function ProfileStats({ reputation, rewardPoints, badges }: Props) {
  return (
    <div className="vv-card p-5">
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="vv-card-soft p-3">
          <p className="text-xs text-slate-500">Reputation</p>
          <p className="text-xl font-semibold text-veriverse-dark">{Number(reputation || 0)}</p>
          <ReputationInfo className="mt-1" />
        </div>

        <div className="vv-card-soft p-3">
          <p className="text-xs text-slate-500">Reward Points</p>
          <p className="text-xl font-semibold text-veriverse-dark">{Number(rewardPoints || 0)}</p>
          <p className="mt-1 text-xs text-slate-500">Points earned through platform contribution.</p>
        </div>
      </div>

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
