import { TrustStatus, canTransitionTrustState } from "@/lib/trustTransitions";

export function validateTransitionSequence(sequence: TrustStatus[]): boolean {
  if (sequence.length <= 1) return true;

  for (let i = 0; i < sequence.length - 1; i++) {
    if (!canTransitionTrustState(sequence[i], sequence[i + 1])) {
      return false;
    }
  }

  return true;
}
