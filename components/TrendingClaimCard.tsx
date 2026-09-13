// components/TrendingClaimCard.tsx
//
// P3.5: deliberately shows only claim text, its current assessment (or
// "Assessment pending"), a non-scoring "Discussed in N recent post(s)"
// context line, and a link into the full Claim page - never the trend
// score or its per-signal breakdown. Trending tells a viewer a claim is
// receiving unusual attention right now; it must not itself look like a
// truth verdict, which is exactly why the score never appears here. Reuses
// ClaimVerdictBadge and ClaimFollowButton unmodified rather than
// reimplementing either.
import Link from "next/link";
import ClaimVerdictBadge from "@/components/ClaimVerdictBadge";
import ClaimFollowButton from "@/components/ClaimFollowButton";
import type { ClaimVerdictPresentation } from "@/lib/claimPresentation";

export type TrendingClaim = {
  id: string;
  canonicalText: string;
  assessmentStatus: "available" | "assessment_not_available";
  currentAssessment: { verdict: ClaimVerdictPresentation } | null;
  trend: { recentPostCount: number };
  follow: { isFollowing: boolean };
};

type Props = {
  claim: TrendingClaim;
  isLoggedIn: boolean;
  onFollowChange?: (claimId: string, following: boolean) => void;
  onFollowError?: (message: string) => void;
};

export default function TrendingClaimCard({ claim, isLoggedIn, onFollowChange, onFollowError }: Props) {
  const postCountLabel = `Discussed in ${claim.trend.recentPostCount} recent post${
    claim.trend.recentPostCount === 1 ? "" : "s"
  }`;

  return (
    <div className="vv-post-panel">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/claims/${claim.id}`} className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-6 text-veriverse-dark line-clamp-3">{claim.canonicalText}</p>
        </Link>
        <ClaimFollowButton
          claimId={claim.id}
          isFollowing={claim.follow.isFollowing}
          isLoggedIn={isLoggedIn}
          onChange={(following) => onFollowChange?.(claim.id, following)}
          onError={onFollowError}
          testId={`trending-follow-${claim.id}`}
          className="shrink-0 text-xs px-2 py-1"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {claim.assessmentStatus === "available" && claim.currentAssessment ? (
          <ClaimVerdictBadge verdict={claim.currentAssessment.verdict} />
        ) : (
          <span className="vv-verdict-pill vv-verdict-neutral">Assessment pending</span>
        )}
        <span className="text-xs text-slate-500">{postCountLabel}</span>
      </div>

      <Link href={`/claims/${claim.id}`} className="vv-link-accent mt-3 inline-flex text-xs font-medium">
        View claim analysis &rarr;
      </Link>
    </div>
  );
}
