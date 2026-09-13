// lib/trendingClaims.ts
//
// P3.5: a Claim trends because multiple people are independently paying
// attention to it right now - not because one person generated many
// actions or duplicate Posts, and never because of what the current
// assessment says. This file computes no trust and never reads
// assessmentBand/confidence/reputation/expert status as a ranking input -
// those are fetched separately, purely for display.
//
// V1 is an honest approximation, not a true engagement-acceleration model:
// it scopes to Posts *created* within the trend window (mirroring the
// existing Discovery feed's own "recent = the last N created" precedent),
// not to Posts of any age that recently received new engagement. A claim
// whose year-old Post suddenly gets fresh comments today will not surface
// here - that would require per-action timestamp indexes this project does
// not yet have, and building them now would be speculative at current
// scale.
import Post from "@/models/Post";
import Vote from "@/models/Vote";
import Comment from "@/models/Comment";
import Repost from "@/models/Repost";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import ClaimFollow from "@/models/ClaimFollow";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import { getClaimAssessmentPresentation } from "@/lib/claimPresentation";

export const TREND_WINDOW_DAYS = 3;
export const MIN_ATTENTION_ACTORS = 2;
export const TRENDING_RESULT_LIMIT = 10;

type RecentPostInput = {
  id: string;
  claimId: string;
  author: string;
  createdAt: Date;
};

type ActionInput = {
  post: string;
  user: string;
};

export type ClaimAggregate = {
  claimId: string;
  score: number;
  recentPostCount: number;
  engagedUserCount: number;
  latestPostCreatedAt: Date;
};

// Pure - no DB access, fully unit-testable. Each distinct user contributes
// at most once per signal type per claim (posting the same claim five times
// is one "recent post author" unit, not five); a post's own author never
// counts as a voter/commenter/reposter of their own post. assessmentBand,
// confidence, reputation, and expert status are not inputs here because
// they are never fetched by anything that calls this function.
export function aggregateTrendingClaims(params: {
  posts: RecentPostInput[];
  votes: ActionInput[];
  comments: ActionInput[];
  reposts: ActionInput[];
}): ClaimAggregate[] {
  const { posts, votes, comments, reposts } = params;

  const postMap = new Map(posts.map((post) => [post.id, post]));

  const claimPosts = new Map<string, RecentPostInput[]>();
  for (const post of posts) {
    if (!claimPosts.has(post.claimId)) claimPosts.set(post.claimId, []);
    claimPosts.get(post.claimId)!.push(post);
  }

  const claimAuthors = new Map<string, Set<string>>();
  for (const [claimId, claimPostList] of claimPosts) {
    claimAuthors.set(claimId, new Set(claimPostList.map((post) => post.author)));
  }

  const claimVoters = new Map<string, Set<string>>();
  const claimCommenters = new Map<string, Set<string>>();
  const claimReposters = new Map<string, Set<string>>();

  function addAction(target: Map<string, Set<string>>, action: ActionInput) {
    const post = postMap.get(action.post);
    if (!post) return; // action on a post outside the eligible recent set
    if (action.user === post.author) return; // exclude the post's own author
    if (!target.has(post.claimId)) target.set(post.claimId, new Set());
    target.get(post.claimId)!.add(action.user);
  }

  for (const vote of votes) addAction(claimVoters, vote);
  for (const comment of comments) addAction(claimCommenters, comment);
  for (const repost of reposts) addAction(claimReposters, repost);

  const results: ClaimAggregate[] = [];

  for (const [claimId, claimPostList] of claimPosts) {
    const uniqueRecentPostAuthors = claimAuthors.get(claimId) ?? new Set<string>();
    const uniqueVoters = claimVoters.get(claimId) ?? new Set<string>();
    const uniqueCommenters = claimCommenters.get(claimId) ?? new Set<string>();
    const uniqueReposters = claimReposters.get(claimId) ?? new Set<string>();

    const attentionActors = new Set<string>([
      ...uniqueRecentPostAuthors,
      ...uniqueVoters,
      ...uniqueCommenters,
      ...uniqueReposters,
    ]);

    if (attentionActors.size < MIN_ATTENTION_ACTORS) continue;

    const score =
      uniqueRecentPostAuthors.size * 3 +
      uniqueReposters.size * 3 +
      uniqueVoters.size +
      uniqueCommenters.size;

    const latestPostCreatedAt = claimPostList.reduce(
      (latest, post) => (post.createdAt > latest ? post.createdAt : latest),
      claimPostList[0].createdAt
    );

    results.push({
      claimId,
      score,
      recentPostCount: claimPostList.length,
      engagedUserCount: attentionActors.size,
      latestPostCreatedAt,
    });
  }

  return results;
}

const now = () => new Date();
function unavailableUserFilter() {
  return {
    $or: [
      { isDeactivated: true },
      { moderationStatus: "banned" },
      { moderationStatus: "suspended", suspendedUntil: { $gt: now() } },
    ],
  };
}

export type TrendingClaimResult = {
  id: string;
  canonicalText: string;
  // Mirrors the exact assessmentStatus/currentAssessment shape already
  // returned by app/api/claims/[id]/route.ts, so the card can reuse the same
  // "assessment-or-pending" display convention rather than inventing a new
  // one.
  assessmentStatus: "available" | "assessment_not_available";
  currentAssessment: {
    verdict: ReturnType<typeof getClaimAssessmentPresentation>;
    confidenceLevel: string;
  } | null;
  trend: { score: number; recentPostCount: number; engagedUserCount: number };
  follow: { isFollowing: boolean };
  representativePost: {
    id: string;
    content: string;
    author: { username: string; avatarUrl?: string };
    createdAt: Date;
  } | null;
};

// The one orchestration function - fetches bounded, indexed data, delegates
// scoring to the pure function above, then enriches only the final top-N
// with assessment/representative-post data. Global moderation exclusion
// (banned/deactivated/suspended authors) is applied before scoring, so the
// ranking itself is identical for every viewer; block/mute is applied only
// when choosing which representative Post to show a specific viewer.
export async function getTrendingClaims(params: { requesterId: string | null }): Promise<TrendingClaimResult[]> {
  const { requesterId } = params;
  const windowStart = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const moderationExcluded = await User.find(unavailableUserFilter()).select("_id");
  const excludedAuthorIds = moderationExcluded.map((user) => String(user._id));

  const recentPostDocs = await Post.find({
    claimId: { $ne: null },
    createdAt: { $gte: windowStart },
    ...(excludedAuthorIds.length > 0 ? { author: { $nin: excludedAuthorIds } } : {}),
  }).select("_id claimId author createdAt");

  const posts: RecentPostInput[] = recentPostDocs.map((post) => ({
    id: String(post._id),
    claimId: String(post.claimId),
    author: String(post.author),
    createdAt: post.createdAt,
  }));

  if (posts.length === 0) return [];

  const postIds = posts.map((post) => post.id);

  const [voteDocs, commentDocs, repostDocs] = await Promise.all([
    Vote.find({ post: { $in: postIds } }).select("post user"),
    Comment.find({ post: { $in: postIds }, isDeleted: false }).select("post author"),
    Repost.find({ post: { $in: postIds } }).select("post user"),
  ]);

  const votes: ActionInput[] = voteDocs.map((vote) => ({ post: String(vote.post), user: String(vote.user) }));
  const comments: ActionInput[] = commentDocs.map((comment) => ({
    post: String(comment.post),
    user: String(comment.author),
  }));
  const reposts: ActionInput[] = repostDocs.map((repost) => ({ post: String(repost.post), user: String(repost.user) }));

  const aggregates = aggregateTrendingClaims({ posts, votes, comments, reposts });
  if (aggregates.length === 0) return [];

  const claimIds = aggregates.map((aggregate) => aggregate.claimId);
  const claims = await Claim.find({ _id: { $in: claimIds } }).select(
    "canonicalText currentAssessmentVersion firstSeenAt"
  );
  const claimById = new Map(claims.map((claim) => [String(claim._id), claim]));

  // Full deterministic 3-level sort - score, then latest recent-Post
  // activity, then Claim.firstSeenAt - done here because firstSeenAt is
  // only available once Claim documents are fetched.
  aggregates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.latestPostCreatedAt.getTime() !== a.latestPostCreatedAt.getTime()) {
      return b.latestPostCreatedAt.getTime() - a.latestPostCreatedAt.getTime();
    }
    const claimA = claimById.get(a.claimId);
    const claimB = claimById.get(b.claimId);
    const firstSeenA = claimA?.firstSeenAt?.getTime() ?? 0;
    const firstSeenB = claimB?.firstSeenAt?.getTime() ?? 0;
    return firstSeenB - firstSeenA;
  });

  const topAggregates = aggregates.slice(0, TRENDING_RESULT_LIMIT);

  // Batched assessment enrichment - preserves the exact same authoritative
  // invariant as lib/claimAssessmentLookup.ts (claim.currentAssessmentVersion
  // matched to TrustAssessment.claimAssessmentVersion, never latest-by-date)
  // without calling that helper once per claim, since the Claim documents
  // needed for step one are already fetched above for canonicalText/
  // firstSeenAt.
  const assessmentLookupKeys = topAggregates
    .map((aggregate) => claimById.get(aggregate.claimId))
    .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim))
    .map((claim) => ({ claim: claim._id, claimAssessmentVersion: claim.currentAssessmentVersion }));

  const assessments =
    assessmentLookupKeys.length > 0
      ? await TrustAssessment.find({ $or: assessmentLookupKeys }).select("claim claimAssessmentVersion assessmentBand verificationConfidence")
      : [];
  const assessmentByKey = new Map(
    assessments.map((assessment) => [`${assessment.claim}:${assessment.claimAssessmentVersion}`, assessment])
  );

  // Viewer-specific block/mute, applied only to representative-Post
  // selection below - never to eligibility, score, or rank.
  let blockedOrMutedAuthorIds: Set<string> = new Set();
  if (requesterId) {
    const relations = await UserRelation.find({
      sourceUser: requesterId,
      relationType: { $in: ["block", "mute"] },
    }).select("targetUser");
    blockedOrMutedAuthorIds = new Set(relations.map((relation) => String(relation.targetUser)));
  }

  const followedClaimIds: Set<string> = requesterId
    ? new Set(
        (
          await ClaimFollow.find({ user: requesterId, claim: { $in: topAggregates.map((a) => a.claimId) } }).select(
            "claim"
          )
        ).map((follow) => String(follow.claim))
      )
    : new Set();

  const authorIdsNeeded = new Set<string>();
  const claimPostsForRepresentative = new Map<string, RecentPostInput[]>();
  for (const post of posts) {
    if (!claimPostsForRepresentative.has(post.claimId)) claimPostsForRepresentative.set(post.claimId, []);
    claimPostsForRepresentative.get(post.claimId)!.push(post);
  }

  const representativePostChoice = new Map<string, RecentPostInput | null>();
  for (const aggregate of topAggregates) {
    const candidatePosts = (claimPostsForRepresentative.get(aggregate.claimId) || [])
      .filter((post) => !blockedOrMutedAuthorIds.has(post.author))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const chosen = candidatePosts[0] ?? null;
    representativePostChoice.set(aggregate.claimId, chosen);
    if (chosen) authorIdsNeeded.add(chosen.author);
  }

  const authors =
    authorIdsNeeded.size > 0
      ? await User.find({ _id: { $in: Array.from(authorIdsNeeded) } }).select("username avatarUrl")
      : [];
  const authorById = new Map(authors.map((author) => [String(author._id), author]));

  const postContentById = new Map<string, string>();
  if (representativePostChoice.size > 0) {
    const representativePostIds = Array.from(representativePostChoice.values())
      .filter((post): post is RecentPostInput => Boolean(post))
      .map((post) => post.id);
    if (representativePostIds.length > 0) {
      const contentDocs = await Post.find({ _id: { $in: representativePostIds } }).select("content");
      for (const doc of contentDocs) {
        postContentById.set(String(doc._id), doc.content);
      }
    }
  }

  return topAggregates.map((aggregate) => {
    const claim = claimById.get(aggregate.claimId);
    const assessment = claim
      ? assessmentByKey.get(`${claim._id}:${claim.currentAssessmentVersion}`)
      : undefined;

    const chosenPost = representativePostChoice.get(aggregate.claimId) ?? null;
    const chosenAuthor = chosenPost ? authorById.get(chosenPost.author) : undefined;

    return {
      id: aggregate.claimId,
      canonicalText: claim?.canonicalText ?? "",
      assessmentStatus: assessment ? "available" : "assessment_not_available",
      currentAssessment: assessment
        ? {
            verdict: getClaimAssessmentPresentation(assessment.assessmentBand),
            confidenceLevel: assessment.verificationConfidence?.level || "low",
          }
        : null,
      trend: {
        score: aggregate.score,
        recentPostCount: aggregate.recentPostCount,
        engagedUserCount: aggregate.engagedUserCount,
      },
      follow: { isFollowing: followedClaimIds.has(aggregate.claimId) },
      representativePost:
        chosenPost && chosenAuthor
          ? {
              id: chosenPost.id,
              content: postContentById.get(chosenPost.id) ?? "",
              author: { username: chosenAuthor.username, avatarUrl: chosenAuthor.avatarUrl },
              createdAt: chosenPost.createdAt,
            }
          : null,
    };
  });
}
