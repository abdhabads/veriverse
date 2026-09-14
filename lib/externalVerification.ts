// lib/externalVerification.ts
//
// P5.2: the shared orchestration extracted from P5.1's app/api/verify/route.ts
// so both Verify Text and Verify URL go through the exact same
// classify (done by each caller, since the input differs) -> read-only
// resolve -> reuse-an-existing-assessment -> auth-gated expensive
// verification semantics, rather than two independently-maintained copies
// that could drift. Neither caller nor this file ever imports models/Post
// or calls POST /api/posts - Post creation stays a separate, explicit,
// already-existing user action.
import { getUserIdFromRequest, requireActiveUser } from "@/lib/auth";
import type { ContentType } from "@/lib/aiModeration";
import { resolveExistingClaim } from "@/lib/claimIdentity";
import { getAuthoritativeClaimAssessment } from "@/lib/claimAssessmentLookup";
import { evaluateContentTruthPipeline } from "@/lib/aiTruthPipeline";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { buildCanonicalUrl } from "@/lib/siteConfig";
import { ok } from "@/lib/apiResponse";

export type Resolution = "existing" | "new" | "no_claim_found";

export type VerifyResponsePayload = {
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

// The only place either caller invokes the existing, unmodified
// verification pipeline. It creates the Claim/EvidenceObjects/
// TrustAssessment through its own normal authoritative path - this
// function never duplicates that persistence, it only shapes the
// pipeline's own result into the public contract via buildPayload's
// shared, authoritative re-lookup. Deliberately always the same
// "verify_text" rate-limit bucket regardless of caller (Text or URL mode) -
// this gates the one expensive operation both modes ultimately share; a
// URL-specific acquisition-cost bucket is a separate, additional gate the
// URL route applies before ever reaching this function (see
// app/api/verify/route.ts's "verify_url_fetch" bucket).
async function runExpensiveVerification(
  req: Request,
  resolutionText: string,
  contentType: ContentType,
  extractedClaim: string | null,
  extra: Record<string, unknown>
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

  const result = await evaluateContentTruthPipeline(resolutionText);
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
    return ok({ ...payload, ...extra });
  }

  const resolution: Resolution = result.claimMatchTier === "new" ? "new" : "existing";
  const payload = await buildPayload({
    contentType: result.contentType ?? contentType,
    extractedClaim: result.extractedClaim ?? extractedClaim,
    claimId: resultClaimId,
    resolution,
    verificationRequired: false,
  });
  return ok({ ...payload, ...extra });
}

// The shared entry point. `resolutionText` is null exactly when the caller
// already determined there is no verifiable claim (question/instruction) -
// this function never re-classifies; each mode (Text: the raw submission
// via resolveGroundingPlan; URL: the extracted article excerpt, preferring
// the classifier's own extractedClaim - see app/api/verify/route.ts) has
// already decided both the response-shaping contentType/extractedClaim AND
// the exact text Claim identity should be resolved against, since that
// decision genuinely differs by mode and belongs to the caller, not here.
export async function resolveOrVerifyClaim(params: {
  req: Request;
  resolutionText: string | null;
  contentType: ContentType;
  extractedClaim: string | null;
  // Additional product-safe fields merged into every payload this call
  // produces - e.g. URL mode's submittedUrl/finalUrl/pageTitle. Text mode
  // passes nothing extra and the response shape is unchanged from P5.1.
  extra?: Record<string, unknown>;
}): Promise<Response> {
  const { req, resolutionText, contentType, extractedClaim, extra = {} } = params;

  if (resolutionText === null) {
    const payload = await buildPayload({
      contentType,
      extractedClaim: null,
      claimId: null,
      resolution: "no_claim_found",
      verificationRequired: false,
    });
    return ok({ ...payload, ...extra });
  }

  // Read-only lookup only - resolveExistingClaim never creates a Claim on
  // a miss (see its own header comment). This is what makes the
  // anonymous path below genuinely non-mutating rather than merely
  // "doesn't create a Post."
  const existing = await resolveExistingClaim(resolutionText);

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
      return ok({ ...payload, ...extra });
    }

    // Existing Claim, no assessment yet - a real, reachable state (e.g. a
    // prior grounding/assessment attempt for this exact claim failed
    // fail-open). Verifying it is the expensive path, so it requires the
    // same auth gate as a brand-new claim.
    const requesterId = getUserIdFromRequest(req);
    if (!requesterId) {
      const payload = await buildPayload({
        contentType,
        extractedClaim,
        claimId,
        resolution: "existing",
        verificationRequired: true,
      });
      return ok({ ...payload, ...extra });
    }

    return await runExpensiveVerification(req, resolutionText, contentType, extractedClaim, extra);
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
    return ok({ ...payload, ...extra });
  }

  return await runExpensiveVerification(req, resolutionText, contentType, extractedClaim, extra);
}
