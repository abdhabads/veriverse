// lib/contributionSummary.ts
//
// P3.8: single shared computation for public contribution counts, used by
// both app/api/users/[username]/route.ts (public) and app/api/profile/route.ts
// (owner) so the two routes can never drift into different semantics for the
// same three numbers.
//
// Counts describe the profile owner's own authorship volume - never
// filtered by the current viewer's block/mute list (a profile's own
// contribution count is a fact about that person, not about the viewer's
// relationship to them), and never filtered by Post status or contentType
// (a flagged Post, a Post under review, or a question/instruction is still
// something the user authored - this metric is authorship volume, not a
// quality or trust endorsement).
import Post from "@/models/Post";

export type ContributionSummary = {
  posts: number;
  claims: number;
  expertReviews?: number;
};

export async function getContributionSummary(
  userId: string,
  isExpert: boolean
): Promise<ContributionSummary> {
  const [posts, claimIds, expertReviews] = await Promise.all([
    Post.countDocuments({ author: userId }),
    Post.distinct("claimId", { author: userId, claimId: { $ne: null } }),
    isExpert ? Post.countDocuments({ expertReviewedBy: userId }) : Promise.resolve(null),
  ]);

  const summary: ContributionSummary = {
    posts,
    claims: claimIds.length,
  };

  if (isExpert) {
    summary.expertReviews = expertReviews as number;
  }

  return summary;
}
