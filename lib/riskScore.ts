export function applySuspicionPenalty(currentRiskScore: number, currentFlags: number) {
  return {
    riskScore: currentRiskScore + 2,
    suspiciousFlags: currentFlags + 1,
  };
}

export function reduceRiskScore(currentRiskScore: number) {
  return Math.max(0, currentRiskScore - 1);
}
