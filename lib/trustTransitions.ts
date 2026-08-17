export type TrustStatus =
  | "unverified"
  | "verified"
  | "disputed"
  | "false"
  | "flagged"
  | "under_expert_review"
  | "under_appeal_review";

const allowedTransitions: Record<TrustStatus, TrustStatus[]> = {
  unverified: [
    "flagged",
    "under_expert_review",
    "verified",
    "false",
    "disputed",
  ],
  flagged: [
    "under_expert_review",
    "disputed",
    "false",
    "verified",
  ],
  under_expert_review: [
    "verified",
    "false",
    "disputed",
  ],
  verified: [
    "under_appeal_review",
  ],
  false: [
    "under_appeal_review",
  ],
  disputed: [
    "under_appeal_review",
    "under_expert_review",
  ],
  under_appeal_review: [
    "unverified",
    "disputed",
    "verified",
    "false",
  ],
};

export function canTransitionTrustState(
  from: TrustStatus,
  to: TrustStatus
): boolean {
  if (from === to) return true;
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function assertTrustTransition(
  from: TrustStatus,
  to: TrustStatus
): void {
  if (!canTransitionTrustState(from, to)) {
    throw new Error(`Invalid trust state transition: ${from} -> ${to}`);
  }
}
