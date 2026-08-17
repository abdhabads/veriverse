export function markTrustEvaluated<T extends {
  trustEvaluationState?: string;
  lastTrustEvaluatedAt?: Date | null;
}>(post: T) {
  post.trustEvaluationState = "evaluated";
  post.lastTrustEvaluatedAt = new Date();
}

export function markTrustFinalized<T extends {
  trustEvaluationState?: string;
  lastTrustEvaluatedAt?: Date | null;
  finalized?: boolean;
  finalizedAt?: Date | null;
}>(post: T) {
  post.trustEvaluationState = "finalized";
  post.lastTrustEvaluatedAt = new Date();
  post.finalized = true;
  post.finalizedAt = new Date();
}

export function markTrustReopened<T extends {
  trustDecisionVersion?: number;
  trustEvaluationState?: string;
  lastTrustEvaluatedAt?: Date | null;
  finalized?: boolean;
  finalizedAt?: Date | null;
}>(post: T) {
  post.trustDecisionVersion = Math.max(1, Number(post.trustDecisionVersion || 1) + 1);
  post.trustEvaluationState = "reopened";
  post.lastTrustEvaluatedAt = new Date();
  post.finalized = false;
  post.finalizedAt = null;
}
