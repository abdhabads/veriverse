// app/api/verify/route.ts
//
// P5.1: the first external-VeriVerse entry point. Answers "what does
// VeriVerse know about this text?" without requiring a Post to exist and
// without ever creating one - see lib/claimIdentity.ts's own P5.0 audit
// finding that every stage of the Claim/evidence/assessment pipeline
// already operates on plain text or a claimId, never a Post document.
//
// Three operations, deliberately never conflated into one:
//   1. classification + read-only resolution (cheap-ish: one AI screening
//      call plus a DB lookup, never a Claim/EvidenceObject/TrustAssessment
//      write) - safe to run anonymously.
//   2. expensive verification (the existing, unmodified
//      evaluateContentTruthPipeline - full grounding, evidence, and
//      TrustAssessment production) - gated on an active authenticated
//      user and a dedicated rate limit, only ever invoked when resolution
//      alone couldn't already answer the request.
//   3. Post creation - deliberately absent. This route never imports
//      models/Post and never calls POST /api/posts. Publishing stays a
//      separate, explicit, already-existing user action.
import { connectDB } from "@/lib/mongodb";
import { getUserIdFromRequest, requireActiveUser } from "@/lib/auth";
import { screenContentWithAI, type ContentType } from "@/lib/aiModeration";
import { resolveGroundingPlan } from "@/lib/contentTypeRouting";
import { resolveExistingClaim } from "@/lib/claimIdentity";
import { getAuthoritativeClaimAssessment } from "@/lib/claimAssessmentLookup";
import { evaluateContentTruthPipeline } from "@/lib/aiTruthPipeline";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanString } from "@/lib/validation";
import { buildCanonicalUrl } from "@/lib/siteConfig";
import { withRetry, withTimeout } from "@/lib/withRetry";
import { ok, fail } from "@/lib/apiResponse";

// Mirrors Post.content's own existing limit (app/api/posts/route.ts) -
// no code evidence justifies a different boundary for verification text.
const MAX_TEXT_LENGTH = 1000;

type Resolution = "existing" | "new" | "no_claim_found";

type VerifyResponsePayload = {
  contentType: ContentType;
  extractedClaim: string | null;
  claimId: string | null;
  resolution: Resolution;
  assessmentStatus: "available" | "assessment_not_available";
  canonicalClaimUrl: string | null;
  verificationRequired: boolean;
};

// Single place that turns a resolved claimId into the product-safe payload
// shape - used by every branch below so assessmentStatus/canonicalClaimUrl
// are always derived the same authoritative way
// (getAuthoritativeClaimAssessment), never duplicated or approximated.
async function buildPayload(params: {
  contentType: ContentType;
  extractedClaim: string | null;
  claimId: string | null;
  resolution: Resolution;
  verificationRequired: boolean;
}): Promise<VerifyResponsePayload> {
  if (!params.claimId) {
    return {
      contentType: params.contentType,
      extractedClaim: params.extractedClaim,
      claimId: null,
      resolution: params.resolution,
      assessmentStatus: "assessment_not_available",
      canonicalClaimUrl: null,
      verificationRequired: params.verificationRequired,
    };
  }

  const { claim, currentAssessment } = await getAuthoritativeClaimAssessment(params.claimId);
  return {
    contentType: params.contentType,
    extractedClaim: params.extractedClaim,
    claimId: params.claimId,
    resolution: params.resolution,
    assessmentStatus: currentAssessment ? "available" : "assessment_not_available",
    canonicalClaimUrl: claim ? buildCanonicalUrl(`/claims/${claim._id}`) : null,
    verificationRequired: params.verificationRequired,
  };
}

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();
    const cleanedText = cleanString(body.text, { maxLength: MAX_TEXT_LENGTH });
    if (!cleanedText) {
      return fail(`Text is required and must be under ${MAX_TEXT_LENGTH} characters.`, 400);
    }

    // Classification only - no Claim/Evidence/TrustAssessment write occurs
    // here regardless of outcome. Reuses the exact same classifier and the
    // exact same content->groundingQuery routing decision
    // (resolveGroundingPlan) the real pipeline uses, so the text this route
    // resolves identity against is provably the same text
    // evaluateContentTruthPipeline would later resolve identity against -
    // see lib/contentTypeRouting.ts's own comment that a "claim" always
    // grounds against the raw content, not the classifier's extractedClaim
    // field.
    const screening = await withRetry(
      () => withTimeout(screenContentWithAI(cleanedText), 8_000, "AI screening"),
      { maxAttempts: 2, baseDelayMs: 300, label: "AI screening" }
    );
    const contentType = screening.contentType ?? "claim";
    const extractedClaim = screening.extractedClaim ?? null;
    const groundingPlan = resolveGroundingPlan({ content: cleanedText, contentType, extractedClaim });

    if (groundingPlan.skipGrounding) {
      // "No verifiable factual claim was identified" - question/instruction,
      // nothing to resolve or verify. No persistence of any kind.
      const payload = await buildPayload({
        contentType,
        extractedClaim: null,
        claimId: null,
        resolution: "no_claim_found",
        verificationRequired: false,
      });
      return ok(payload);
    }

    const claimText = groundingPlan.groundingQuery;

    // Read-only lookup only - resolveExistingClaim never creates a Claim on
    // a miss (see its own header comment). This is what makes the
    // anonymous path below genuinely non-mutating rather than merely
    // "doesn't create a Post."
    const existing = await resolveExistingClaim(claimText);

    if (existing) {
      const claimId = String(existing.claim._id);
      const { currentAssessment } = await getAuthoritativeClaimAssessment(claimId);

      if (currentAssessment) {
        // Existing Claim, existing authoritative assessment - reuse it.
        // Cheap, safe to be anonymous, and per P5.0/P5.1 policy this NEVER
        // re-invokes the verification pipeline merely because a Claim
        // already resolved - no age/staleness concept exists today and
        // none is introduced here.
        const payload = await buildPayload({
          contentType,
          extractedClaim,
          claimId,
          resolution: "existing",
          verificationRequired: false,
        });
        return ok(payload);
      }

      // Existing Claim, no assessment yet - a real, reachable state (e.g. a
      // prior grounding/assessment attempt for this exact claim failed
      // fail-open). Verifying it is the expensive path, so it requires the
      // same auth gate as a brand-new claim - see the shared branch below.
      const requesterId = getUserIdFromRequest(req);
      if (!requesterId) {
        const payload = await buildPayload({
          contentType,
          extractedClaim,
          claimId,
          resolution: "existing",
          verificationRequired: true,
        });
        return ok(payload);
      }

      return await runExpensiveVerification(req, cleanedText, contentType, extractedClaim);
    }

    // No existing Claim at all - a first-time verification would create
    // one. Anonymous requests must remain non-mutating regardless of
    // classification outcome (including a classifier failing open to
    // "claim") - the auth gate below is what makes that true, structurally,
    // not a special case in the classification logic itself.
    const requesterId = getUserIdFromRequest(req);
    if (!requesterId) {
      const payload = await buildPayload({
        contentType,
        extractedClaim,
        claimId: null,
        resolution: "new",
        verificationRequired: true,
      });
      return ok(payload);
    }

    return await runExpensiveVerification(req, cleanedText, contentType, extractedClaim);
  } catch {
    return fail("Failed to process verification request", 500);
  }
}

// The only place this route invokes the existing, unmodified verification
// pipeline. It creates the Claim/EvidenceObjects/TrustAssessment through
// its own normal authoritative path - this function never duplicates that
// persistence, it only shapes the pipeline's own result into the public
// contract via buildPayload's shared, authoritative re-lookup.
async function runExpensiveVerification(
  req: Request,
  cleanedText: string,
  contentType: ContentType,
  extractedClaim: string | null
) {
  const guard = await requireActiveUser(req);
  if (guard.errorResponse) return guard.errorResponse;
  const userId = String(guard.user._id);

  const limitResponse = enforceRateLimit({
    key: getRateLimitKey(req, "verify_text", userId),
    windowMs: 60 * 1000,
    max: 5,
    message: "You are requesting verifications too quickly. Please slow down.",
  });
  if (limitResponse) return limitResponse;

  const result = await evaluateContentTruthPipeline(cleanedText);
  const resultClaimId = result.claimId ?? null;

  if (!resultClaimId) {
    // The pipeline's own (re-run) classification decided there was nothing
    // to verify after all - report the same safe no-claim response rather
    // than a partial/inconsistent result.
    const payload = await buildPayload({
      contentType: result.contentType ?? contentType,
      extractedClaim: null,
      claimId: null,
      resolution: "no_claim_found",
      verificationRequired: false,
    });
    return ok(payload);
  }

  const resolution: Resolution = result.claimMatchTier === "new" ? "new" : "existing";
  const payload = await buildPayload({
    contentType: result.contentType ?? contentType,
    extractedClaim: result.extractedClaim ?? extractedClaim,
    claimId: resultClaimId,
    resolution,
    verificationRequired: false,
  });
  return ok(payload);
}
