// Type definition for the result of the truth pipeline
export type FullTruthPipelineResult = {
  aiLabel: AiScreeningResult["aiLabel"];
  aiRiskScore: number;
  moderationReasons: string[];
  provider: "openai" | "fallback";
  raw: any;
  groundingStatus: "checked" | "insufficient_evidence" | "not_checked";
  groundingSummary: string;
  groundingSources: Array<{
    title: string;
    url: string;
    domain: string;
    stance: "supports" | "contradicts" | "context" | "unknown";
  }>;
  groundingMetrics: GroundingMetrics;
  groundingConfidence: number;
  contradictionCount: number;
  supportCount: number;
  verificationScore: number;
};

export const TRUTH_PIPELINE_CACHE_VERSION = "9";
import { screenContentWithAI, AiScreeningResult } from "@/lib/aiModeration";
import { runGroundedFactCheck } from "@/lib/groundedFactCheck";
import { runTavilyGrounding } from "@/lib/tavilyGrounding";
import { runInternalGrounding } from "@/lib/internalGrounding";
import GroundingCache from "@/models/GroundingCache";
import { hashContent } from "@/lib/hash";
import { connectDB } from "@/lib/mongodb";
import { applyGroundingRiskFloor, mapRiskToLabel } from "@/lib/truthScoring";
import { withRetry, withTimeout } from "@/lib/withRetry";
import {
  calculateVerificationScore,
  summarizeGroundingSources,
  GroundingMetrics,
} from "@/lib/groundingMetrics";



function emptyWebGrounding() {
  return {
    groundingStatus: "not_checked" as const,
    groundingSummary: "",
    groundingSources: [] as FullTruthPipelineResult["groundingSources"],
    evidenceRiskAdjustment: 0,
    raw: undefined as unknown,
  };
}

function normalizeGroundingStatus(input: {
  groundingStatus: "checked" | "insufficient_evidence" | "not_checked";
  groundingSummary: string;
  groundingSources: FullTruthPipelineResult["groundingSources"];
  provider: AiScreeningResult["provider"];
}): FullTruthPipelineResult["groundingStatus"] {
  if (
    input.provider === "fallback" &&
    input.groundingStatus === "insufficient_evidence" &&
    !input.groundingSummary.trim() &&
    input.groundingSources.length === 0
  ) {
    return "not_checked";
  }

  return input.groundingStatus;
}

function normalizeCachedResult(
  result: FullTruthPipelineResult
): FullTruthPipelineResult {
  const normalizedGroundingStatus = normalizeGroundingStatus({
    groundingStatus: result.groundingStatus,
    groundingSummary: result.groundingSummary,
    groundingSources: result.groundingSources,
    provider: result.provider,
  });
  const normalizedRiskScore = applyGroundingRiskFloor({
    baseScore: result.aiRiskScore,
    contradictionCount: result.contradictionCount,
    groundingConfidence: result.groundingConfidence,
    groundingStatus: normalizedGroundingStatus,
  });
  const moderationReasons = Number(result.contradictionCount || 0) > 0
    ? [...new Set([...(result.moderationReasons || []), "Grounding found contradictory evidence"])]
    : result.moderationReasons;

  return {
    ...result,
    aiLabel: mapRiskToLabel(normalizedRiskScore),
    aiRiskScore: normalizedRiskScore,
    moderationReasons,
    groundingStatus: normalizedGroundingStatus,
    verificationScore: result.verificationScore > 1
      ? result.verificationScore / 100
      : result.verificationScore,
  };
}

function emptyInternalGrounding() {
  return {
    internalSummary: "",
    internalEvidenceAdjustment: 0,
    internalSources: [] as Array<{ file_name: string; score?: number }>,
  };
}

export async function evaluateContentTruthPipeline(
  content: string
): Promise<FullTruthPipelineResult> {
  await connectDB();
  const failOpen = process.env.AI_FAIL_OPEN === "true";

  const contentHash = hashContent(`${TRUTH_PIPELINE_CACHE_VERSION}:${content}`);

  const cached = await GroundingCache.findOne({
    contentHash,
    expiresAt: { $gt: new Date() },
  });

  if (cached?.result) {
    return normalizeCachedResult(cached.result as FullTruthPipelineResult);
  }

  const baseScreening = await withRetry(
    () => withTimeout(
      screenContentWithAI(content),
      8_000,
      "AI screening"
    ),
    {
      maxAttempts: 2,
      baseDelayMs: 300,
      label: "AI screening",
    }
  ).catch(async (error) => {
    if (failOpen) {
      console.warn("AI screening failed after retries, falling back to local classifier:", error?.message ?? error);
      // Force local fallback by temporarily disabling AI for this call
      const prev = process.env.AI_ENABLED;
      process.env.AI_ENABLED = "false";
      try {
        return await screenContentWithAI(content);
      } finally {
        process.env.AI_ENABLED = prev;
      }
    }
    throw error;
  });

  // When AI is disabled, skip all grounding (all paths call OpenAI which would throw)
  const aiDisabled = process.env.AI_ENABLED === "false";

  const [webGrounding, internalGrounding] = await Promise.all([
    aiDisabled
      ? Promise.resolve(emptyWebGrounding())
      : withRetry(
          () => withTimeout(runGroundedFactCheck(content), 15_000, "Web grounding"),
          { maxAttempts: 2, baseDelayMs: 1_000, label: "Web grounding" }
        ).catch(async (error) => {
          if (failOpen) {
            // Try Tavily as free fallback before giving up
            const tavilyKey = process.env.TAVILY_API_KEY;
            if (tavilyKey) {
              try {
                console.warn("OpenAI grounding failed, trying Tavily fallback:", error?.message ?? error);
                return await runTavilyGrounding(content);
              } catch (tavilyError) {
                console.warn("Tavily fallback also failed, using neutral grounding:", tavilyError);
              }
            } else {
              console.warn("Grounded fact check failed after retries, using neutral grounding:", error);
            }
            return emptyWebGrounding();
          }
          throw error;
        }),
    aiDisabled
      ? Promise.resolve(emptyInternalGrounding())
      : withRetry(
          () => withTimeout(runInternalGrounding(content), 10_000, "Internal grounding"),
          { maxAttempts: 2, baseDelayMs: 500, label: "Internal grounding" }
        ).catch((error) => {
          if (failOpen) {
            console.warn("Internal grounding failed after retries, using neutral evidence:", error);
            return emptyInternalGrounding();
          }

          throw error;
        }),
  ]);

  const groundingMetrics = summarizeGroundingSources(webGrounding.groundingSources);
  const normalizedGroundingStatus = normalizeGroundingStatus({
    groundingStatus: webGrounding.groundingStatus,
    groundingSummary: webGrounding.groundingSummary || internalGrounding.internalSummary,
    groundingSources: webGrounding.groundingSources,
    provider: baseScreening.provider,
  });
  const adjustedScore = applyGroundingRiskFloor({
    baseScore:
      baseScreening.aiRiskScore +
      webGrounding.evidenceRiskAdjustment +
      internalGrounding.internalEvidenceAdjustment,
    contradictionCount: groundingMetrics?.contradictionCount ?? 0,
    groundingConfidence: groundingMetrics?.groundingConfidence ?? 0,
    groundingStatus: normalizedGroundingStatus,
  });
  const combinedReasons = [
    ...baseScreening.moderationReasons,
    ...((groundingMetrics?.contradictionCount ?? 0) > 0
      ? ["Grounding found contradictory evidence"]
      : []),
  ];
  const verificationScore = calculateVerificationScore(
    groundingMetrics,
    normalizedGroundingStatus
  ) / 100;

  const finalResult: FullTruthPipelineResult = {
    aiLabel: mapRiskToLabel(adjustedScore),
    aiRiskScore: adjustedScore,
    moderationReasons: [...new Set(combinedReasons)].slice(0, 10),
    provider: baseScreening.provider,
    raw: {
      base: baseScreening.raw,
      webGrounding: webGrounding.raw,
      internalGrounding,
    },
    groundingStatus: normalizedGroundingStatus,
    groundingSummary: webGrounding.groundingSummary || internalGrounding.internalSummary,
    groundingSources: webGrounding.groundingSources,
    groundingMetrics,
    groundingConfidence: groundingMetrics?.groundingConfidence ?? 0,
    contradictionCount: groundingMetrics?.contradictionCount ?? 0,
    supportCount: groundingMetrics?.supportCount ?? 0,
    verificationScore,
  };

  await GroundingCache.findOneAndUpdate(
    { contentHash },
    {
      contentHash,
      contentPreview: content.slice(0, 200),
      result: finalResult,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6),
    },
    {
      upsert: true,
      returnDocument: "before",
      setDefaultsOnInsert: true,
    }
  );

  return finalResult;
}