type BadgeInput = {
  reputation: number;
  rewardPoints: number;
};

export function calculateBadges({ reputation, rewardPoints }: BadgeInput): string[] {
  const badges: string[] = [];

  if (reputation >= 20) badges.push("Trusted Contributor");
  if (reputation >= 50) badges.push("Truth Guardian");
  if (rewardPoints >= 50) badges.push("Reward Earner");
  if (rewardPoints >= 150) badges.push("Top Verifier");

  return badges;
}