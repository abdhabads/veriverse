export function getVotingWeight(reputation: number): number {
  if (reputation >= 100) return 3;
  if (reputation >= 50) return 2;
  if (reputation >= 10) return 1.5;
  if (reputation >= 0) return 1;

  return 0.5;
}
