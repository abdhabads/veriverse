export type GroundingRiskInput = {
  baseScore: number;
  groundingConfidence?: number;
  contradictionCount?: number;
  groundingStatus?: "checked" | "insufficient_evidence" | "not_checked";
};

export function clampRiskScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function mapRiskToLabel(score: number): "safe" | "suspicious" | "needs_review" | "high_risk" {
  if (score >= 75) return "high_risk";
  if (score >= 45) return "needs_review";
  if (score >= 20) return "suspicious";
  return "safe";
}

export function applyGroundingRiskFloor(input: GroundingRiskInput): number {
  let score = clampRiskScore(input.baseScore);
  const contradictionCount = Number(input.contradictionCount || 0);
  const groundingConfidence = Number(input.groundingConfidence || 0);

  if (contradictionCount >= 2 && groundingConfidence >= 60) {
    score = Math.max(score, 75);
  } else if (contradictionCount >= 1 && groundingConfidence >= 40) {
    score = Math.max(score, 45);
  } else if (contradictionCount >= 1) {
    score = Math.max(score, 20);
  }

  if (input.groundingStatus === "insufficient_evidence" && contradictionCount >= 1) {
    score = Math.max(score, 45);
  }

  return clampRiskScore(score);
}