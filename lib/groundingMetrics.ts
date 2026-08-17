type GroundingSource = {
  title?: string;
  url?: string;
  domain?: string;
  stance?: "supports" | "contradicts" | "context" | "unknown";
};

export type GroundingMetrics = {
  groundingConfidence: number;
  contradictionCount: number;
  supportCount: number;
  contextCount: number;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateVerificationScore(metrics: GroundingMetrics, groundingStatus: string): number {
  const contextBonus = Math.min(10, metrics.contextCount * 3);
  const evidenceGapPenalty = groundingStatus === "insufficient_evidence" ? 20 : 0;

  return clampScore(
    20 +
      metrics.supportCount * 15 -
      metrics.contradictionCount * 18 +
      metrics.groundingConfidence * 0.25 +
      contextBonus -
      evidenceGapPenalty
  );
}

export function summarizeGroundingSources(
  sources: GroundingSource[] = []
): GroundingMetrics {
  let contradictionCount = 0;
  let supportCount = 0;
  let contextCount = 0;

  for (const source of sources) {
    if (source.stance === "contradicts") contradictionCount += 1;
    else if (source.stance === "supports") supportCount += 1;
    else if (source.stance === "context") contextCount += 1;
  }

  const totalUseful = contradictionCount + supportCount + contextCount;

  let groundingConfidence = 0;

  if (totalUseful >= 1) groundingConfidence += 20;
  if (totalUseful >= 2) groundingConfidence += 20;
  if (totalUseful >= 4) groundingConfidence += 20;

  if (contradictionCount >= 1 || supportCount >= 1) groundingConfidence += 20;
  if (contradictionCount >= 2 || supportCount >= 2) groundingConfidence += 20;

  groundingConfidence = Math.max(0, Math.min(100, groundingConfidence));

  return {
    groundingConfidence,
    contradictionCount,
    supportCount,
    contextCount,
  };
}
