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
    stanceEvidence: string | null;
    // Ref into the EvidenceObject collection (Sprint 1) - additive, optional,
    // absent for anything created before this sprint or when evidence
    // persistence itself failed (see evaluateContentTruthPipeline).
    evidenceObjectId?: string;
  }>;
  groundingMetrics: GroundingMetrics;
  groundingConfidence: number;
  contradictionCount: number;
  supportCount: number;
  verificationScore: number;
  contentType: AiScreeningResult["contentType"];
  extractedClaim: string | null;
  // Non-authoritative in Sprint 1: computed and exposed for observability/
  // benchmarking, but does NOT drive aiLabel, verificationScore, status
  // routing, or contradiction forcing. See lib/evidenceScoring.ts.
  evidenceAssessment?: EvidenceAssessment;
  // Sprint 2: ref into models/Claim.ts - the underlying proposition this
  // content asserts, distinct from this specific post. Absent for content
  // with nothing to verify (question/instruction) or when claim resolution
  // itself failed (fail-open, like evidence persistence - see below).
  claimId?: string;
  claimMatchTier?: "exact" | "high_confidence" | "new";
  // Sprint 3: ref into models/TrustAssessment.ts for the claim's CURRENT
  // assessment version at the time this pipeline ran. Additive/non-
  // authoritative - see lib/trustAssessment.ts and the Sprint 3 report for
  // exactly what does and doesn't consume this yet (nothing does).
  trustAssessmentId?: string;
};

export const TRUTH_PIPELINE_CACHE_VERSION = "15";
import { screenContentWithAI, AiScreeningResult } from "@/lib/aiModeration";
import { runGroundedFactCheck } from "@/lib/groundedFactCheck";
import { runTavilyGrounding } from "@/lib/tavilyGrounding";
import { runInternalGrounding } from "@/lib/internalGrounding";
import GroundingCache from "@/models/GroundingCache";
import { hashContent } from "@/lib/hash";
import { connectDB } from "@/lib/mongodb";
import { applyGroundingRiskFloor, mapRiskToLabel } from "@/lib/truthScoring";
import { withRetry, withTimeout } from "@/lib/withRetry";
import { resolveGroundingPlan } from "@/lib/contentTypeRouting";
import { detectHeuristicMismatch } from "@/lib/nonClaimHeuristic";
import { logEvent } from "@/lib/logger";
import {
  calculateVerificationScore,
  summarizeGroundingSources,
  GroundingMetrics,
} from "@/lib/groundingMetrics";
import { persistEvidenceObjects, EvidenceCandidate } from "@/lib/evidencePersistence";
import { assessEvidenceStrength, EvidenceAssessment, EvidenceItemLike } from "@/lib/evidenceScoring";
import { buildAndPersistTrustAssessment } from "@/lib/trustAssessment";
import { isShadowModeEnabled, runShadowAssessment } from "@/lib/shadowMode";
import { ensureClaimComponents, assignEvidenceToComponent } from "@/lib/claimComponents";
import {
  findOrCreateClaim,
  getExistingEvidenceForClaim,
  advanceClaimAssessmentVersion,
  touchClaimLastEvaluatedAt,
  EvidenceForClaim,
} from "@/lib/claimIdentity";



function emptyWebGrounding() {
  return {
    groundingStatus: "not_checked" as const,
    groundingSummary: "",
    groundingSources: [] as FullTruthPipelineResult["groundingSources"],
    evidenceCandidates: [] as EvidenceCandidate[],
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
    contentType: result.contentType ?? "claim",
    extractedClaim: result.extractedClaim ?? null,
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

  const contentType = baseScreening.contentType ?? "claim";
  const extractedClaim = baseScreening.extractedClaim ?? null;
  const groundingPlan = resolveGroundingPlan({ content, contentType, extractedClaim });
  const groundingQuery = groundingPlan.groundingQuery;
  const skipGrounding = groundingPlan.skipGrounding;

  // Advisory only - never gates behaviour. Logged so prompt drift in the
  // classifier's contentType calls can be monitored over time.
  const { mismatch, heuristic } = detectHeuristicMismatch(content, skipGrounding);
  if (mismatch) {
    logEvent("CONTENT_TYPE_HEURISTIC_MISMATCH", {
      contentType,
      skipGrounding,
      heuristicLooksLikeNonClaim: heuristic.looksLikeNonClaim,
      heuristicReason: heuristic.reason,
      contentPreview: content.slice(0, 120),
    });
  }

  // Sprint 2: a Claim exists for exactly the content this pipeline actually
  // verifies - !skipGrounding is already the tested, authoritative "does
  // this assert something verifiable" decision (lib/contentTypeRouting.ts),
  // so claim eligibility reuses it directly rather than a second, possibly-
  // diverging check. groundingQuery (not raw `content`) is the claim text:
  // it's what grounding is actually run against, so it's what claim identity
  // should be computed from - for a rhetorical_claim with a successfully
  // extracted assertion, that's the assertion, not the rhetorical wrapper.
  // Fails open like evidence persistence: a claim-resolution error must
  // never block screening/posting.
  let claimId: string | undefined;
  let claimMatchTier: FullTruthPipelineResult["claimMatchTier"];
  let priorClaimEvidence: EvidenceForClaim[] = [];
  let claimWasNewlyCreated = false;
  let trustAssessmentId: string | undefined;
  let claimComponentRefs: Array<{ id: string; propositionText: string }> = [];

  if (!skipGrounding && !aiDisabled) {
    try {
      const claimResult = await findOrCreateClaim(groundingQuery);
      claimId = String(claimResult.claim._id);
      claimMatchTier = claimResult.matchTier;
      claimWasNewlyCreated = claimResult.created;
      if (!claimResult.created) {
        priorClaimEvidence = await getExistingEvidenceForClaim(claimId);
      }

      // Sprint 4: proposition decomposition is additive and independent of
      // evidence/assessment versioning (see the Sprint 4 report's Phase 13
      // section) - a failure here must not block claim/evidence resolution
      // above, so it's deliberately its own try scope.
      try {
        const components = await ensureClaimComponents(claimId);
        claimComponentRefs = components.map((component: any) => ({
          id: String(component._id),
          propositionText: component.propositionText,
        }));
      } catch (componentError) {
        logEvent("CLAIM_COMPONENT_EXTRACTION_FAILED", {
          error: componentError instanceof Error ? componentError.message : String(componentError),
          claimId,
        });
      }
    } catch (error) {
      logEvent("CLAIM_RESOLUTION_FAILED", {
        error: error instanceof Error ? error.message : String(error),
        contentPreview: content.slice(0, 120),
      });
    }
  }

  const [webGrounding, internalGrounding] = await Promise.all([
    aiDisabled || skipGrounding
      ? Promise.resolve(emptyWebGrounding())
      : withRetry(
          () => withTimeout(runGroundedFactCheck(groundingQuery), 25_000, "Web grounding"),
          { maxAttempts: 2, baseDelayMs: 1_000, label: "Web grounding" }
        ).catch(async (error) => {
          if (failOpen) {
            // Try Tavily as free fallback before giving up
            const tavilyKey = process.env.TAVILY_API_KEY;
            if (tavilyKey) {
              try {
                console.warn("OpenAI grounding failed, trying Tavily fallback:", error?.message ?? error);
                return await runTavilyGrounding(groundingQuery);
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
    aiDisabled || skipGrounding
      ? Promise.resolve(emptyInternalGrounding())
      : withRetry(
          () => withTimeout(runInternalGrounding(groundingQuery), 10_000, "Internal grounding"),
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

  // Evidence persistence is additive infrastructure, not on the critical
  // path: a failure here (e.g. a transient DB error) must never block
  // screening/posting, matching this file's existing fail-open philosophy
  // for grounding itself. Falls back to no evidenceObjectId refs and no
  // evidenceAssessment rather than throwing.
  let groundingSourcesWithEvidenceIds = webGrounding.groundingSources;
  let evidenceAssessment: EvidenceAssessment | undefined;

  try {
    // Sprint 4: attach each candidate's target component, if determined,
    // before persisting - see lib/claimComponents.ts's
    // assignEvidenceToComponent for how conservative this is.
    const candidatesWithComponents =
      claimComponentRefs.length > 0
        ? webGrounding.evidenceCandidates.map((candidate) => ({
            ...candidate,
            claimComponentId: assignEvidenceToComponent(candidate.evidenceText, claimComponentRefs),
          }))
        : webGrounding.evidenceCandidates;

    const persisted = await persistEvidenceObjects({
      contentHash,
      claimId,
      candidates: candidatesWithComponents,
    });

    if (persisted.length > 0) {
      groundingSourcesWithEvidenceIds = webGrounding.groundingSources.map((source, index) => {
        const match = persisted[index];
        return match && match.sourceUrl === source.url
          ? { ...source, evidenceObjectId: match.evidenceObjectId }
          : source;
      });
    }

    // Phase 5/6: assess against the claim's FULL current evidence (what
    // already existed + what's genuinely new this run), not just this run's
    // batch - a claim living across multiple posts accumulates evidence over
    // time. Items persistEvidenceObjects reused via dedup are already
    // represented in priorClaimEvidence, so only "created: true" items are
    // added on top of it, to avoid double-counting the same EvidenceObject.
    const newlyCreatedThisRun: EvidenceItemLike[] = persisted
      .filter((item) => item.created)
      .map((item) => ({
        stance: item.stance,
        authorityScore: item.authorityScore,
        relevanceScore: item.relevanceScore,
        stanceConfidence: item.stanceConfidence,
        independenceGroup: item.independenceGroup,
        sourceType: item.sourceType,
      }));
    const priorAsItemLike: EvidenceItemLike[] = priorClaimEvidence.map((item) => ({
      stance: item.stance,
      authorityScore: item.authorityScore,
      relevanceScore: item.relevanceScore,
      stanceConfidence: item.stanceConfidence,
      independenceGroup: item.independenceGroup,
      sourceType: item.sourceType,
    }));
    const allEvidenceForClaim = priorAsItemLike.concat(newlyCreatedThisRun);

    if (allEvidenceForClaim.length > 0) {
      evidenceAssessment = assessEvidenceStrength(allEvidenceForClaim);
    }

    if (claimId) {
      if (claimWasNewlyCreated) {
        await touchClaimLastEvaluatedAt(claimId);
      } else if (newlyCreatedThisRun.length > 0) {
        await advanceClaimAssessmentVersion({ claimId, priorEvidence: priorClaimEvidence });
      } else {
        await touchClaimLastEvaluatedAt(claimId);
      }

      // Sprint 3: build (or, if nothing changed this round, idempotently
      // reuse) the structured trust assessment for the claim's current
      // version. Additive - see FullTruthPipelineResult.trustAssessmentId's
      // comment. Failure here must not affect the branches above, which is
      // why it's the last thing in this try block.
      const trustAssessment = await buildAndPersistTrustAssessment(claimId);
      if (trustAssessment) {
        trustAssessmentId = String(trustAssessment._id);

        // Shadow Mode Implementation: non-authoritative observer, called
        // from exactly this one place, immediately after and structurally
        // separate from the persistence step above, per
        // docs/SHADOW_MODE_CONTRACT.md §4's enforcement mechanism. Its
        // return value (void) is never attached to FullTruthPipelineResult
        // or any other value threaded back to a caller. isShadowModeEnabled()
        // gates the call itself (not merely the function's internals) so a
        // spy on runShadowAssessment proves zero invocations when disabled -
        // contract §7's verification procedure, test 1.
        if (isShadowModeEnabled()) {
          await runShadowAssessment(claimId, trustAssessment.assessmentBand).catch((error) => {
            // Defense-in-depth only - runShadowAssessment already catches
            // everything internally and must never reject. If it somehow
            // did, it still must not affect this response.
            logEvent("SHADOW_ASSESSMENT_UNEXPECTED_FAILURE", {
              claimId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      }
    }
  } catch (error) {
    logEvent("EVIDENCE_PERSISTENCE_FAILED", {
      error: error instanceof Error ? error.message : String(error),
      contentHash,
      claimId,
    });
  }

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
    groundingSources: groundingSourcesWithEvidenceIds,
    groundingMetrics,
    groundingConfidence: groundingMetrics?.groundingConfidence ?? 0,
    contradictionCount: groundingMetrics?.contradictionCount ?? 0,
    supportCount: groundingMetrics?.supportCount ?? 0,
    verificationScore,
    contentType,
    extractedClaim,
    evidenceAssessment,
    claimId,
    claimMatchTier,
    trustAssessmentId,
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