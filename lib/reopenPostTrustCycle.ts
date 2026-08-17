import { TrustStatus } from "@/lib/trustTransitions";

type ReopenablePost = {
  status: TrustStatus;
  trustDecisionVersion?: number;
  trustEvaluationState?: string;
  lastTrustEvaluatedAt?: Date | null;
  finalized?: boolean;
  finalizedAt?: Date | null;
  expertDecision?: string;
  expertReviewedBy?: unknown;
  accurateVotes?: number;
  inaccurateVotes?: number;
  accurateWeight?: number;
  inaccurateWeight?: number;
  hasActiveAppeal?: boolean;
};

export function reopenPostTrustCycle(post: ReopenablePost) {
  post.status = "unverified";
  post.trustDecisionVersion = Math.max(1, Number(post.trustDecisionVersion || 1) + 1);
  post.trustEvaluationState = "reopened";
  post.lastTrustEvaluatedAt = new Date();
  post.finalized = false;
  post.finalizedAt = null;
  post.expertDecision = "";
  post.expertReviewedBy = null;
  post.accurateVotes = 0;
  post.inaccurateVotes = 0;
  post.accurateWeight = 0;
  post.inaccurateWeight = 0;
  post.hasActiveAppeal = false;
}
