import { TrustStatus } from "@/lib/trustTransitions";

type FinalizablePost = {
  finalized?: boolean;
  status?: TrustStatus;
  expertDecision?: string;
  hasActiveAppeal?: boolean;
  trustEvaluationState?: string;
};

export function canCommunityFinalizePost(post: FinalizablePost): boolean {
  if (post.finalized) return false;
  if (post.hasActiveAppeal) return false;
  if (post.status === "under_appeal_review") return false;
  if (post.status === "under_expert_review") return false;
  if (post.expertDecision && post.expertDecision !== "") return false;
  if (post.trustEvaluationState === "finalized") return false;

  return true;
}
