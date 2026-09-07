import { countDistinctGroups } from "@/lib/sourceIndependence";

type GroundingSource = {
  title?: string;
  url?: string;
  domain?: string;
  stance?: "supports" | "contradicts" | "context" | "unknown";
};

type EvidenceObjectLike = {
  stance?: "supports" | "contradicts" | "context" | "unknown";
  independenceGroup?: string;
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

// Same GroundingMetrics shape as summarizeGroundingSources (so
// calculateVerificationScore's formula and every existing caller/test of it
// are completely unaffected), but counts DISTINCT independence groups per
// stance instead of raw source count - "10 URLs of the same wire report"
// contribute 1 to supportCount/contradictionCount here, not 10. This is the
// Sprint 1 evidence representation feeding the metrics layer (Phase 8), but
// it is NOT yet wired into aiTruthPipeline.ts as the authoritative source
// for Post.contradictionCount/supportCount/verificationScore - see
// lib/evidenceScoring.ts's header for why that switch is deliberately
// deferred to a later, benchmark-informed sprint.
export function summarizeEvidenceObjects(
  evidenceObjects: EvidenceObjectLike[] = []
): GroundingMetrics {
  const supporting = evidenceObjects.filter((item) => item.stance === "supports");
  const contradicting = evidenceObjects.filter((item) => item.stance === "contradicts");
  const contextual = evidenceObjects.filter((item) => item.stance === "context");

  const supportCount = countDistinctGroups(
    supporting.map((item) => item.independenceGroup || "")
  );
  const contradictionCount = countDistinctGroups(
    contradicting.map((item) => item.independenceGroup || "")
  );
  const contextCount = countDistinctGroups(
    contextual.map((item) => item.independenceGroup || "")
  );

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
