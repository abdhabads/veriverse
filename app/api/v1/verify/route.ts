// app/api/v1/verify/route.ts
//
// P5.5: the versioned, external-safe Partner API entry point over the same
// verification capability the web app's Verify Text/URL already exposes at
// app/api/verify/route.ts. Reuses the exact same shared orchestration
// (lib/externalVerification.ts's resolveOrVerifyClaim), the same P5.2
// SSRF-hardened URL acquisition (lib/boundedFetch.ts, lib/articleExtraction.ts),
// and the same underlying verification engine (lib/aiTruthPipeline.ts).
// What differs is the authorization model (a pre-configured partner API
// key + capability, never a user session - lib/partnerAuth.ts) and the
// response contract (a small, stable, explicitly versioned external
// schema instead of the web app's internal shape - see docs/PARTNER_API.md).
//
// Deliberately does NOT modify app/api/verify/route.ts - that route keeps
// serving the logged-in web app exactly as before. This file is a second,
// independent caller of the same shared orchestration, exactly the
// relationship Text mode and URL mode already have to each other.
//
// Server-to-server only. No CORS headers are added here, so the default
// same-origin browser policy applies - a partner's own frontend must never
// hold this key; only a partner's backend calls this endpoint (see
// docs/PARTNER_API.md's embed guidance).
//
// Post creation is deliberately absent from this entire file, exactly as
// in app/api/verify/route.ts - it never imports models/Post and never
// calls POST /api/posts.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { screenContentWithAI } from "@/lib/aiModeration";
import { resolveGroundingPlan } from "@/lib/contentTypeRouting";
import { resolveOrVerifyClaim, type ExpensiveVerificationAuthorizer } from "@/lib/externalVerification";
import { getAuthoritativeClaimAssessment } from "@/lib/claimAssessmentLookup";
import { getClaimSummarySentence } from "@/lib/claimPresentation";
import { fetchPublicHtml } from "@/lib/boundedFetch";
import { extractArticleContent } from "@/lib/articleExtraction";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { cleanString } from "@/lib/validation";
import { withRetry, withTimeout } from "@/lib/withRetry";
import { fail } from "@/lib/apiResponse";
import { getPartnerIdentity, type PartnerIdentity } from "@/lib/partnerAuth";

// Mirrors app/api/verify/route.ts's own Text-mode bound exactly - no
// evidence justifies a different limit for a partner submission.
const MAX_TEXT_LENGTH = 1000;

// General API traffic, per partner - separate from both of the web app's
// own buckets ("verify_text", "verify_url_fetch") so partner traffic can
// never contend with or be miscounted against casual web-app usage.
// Conservative starting point: comfortably above what a legitimate
// integration checking a handful of claims needs, well below anything
// that could turn this into a bulk-scraping surface.
const PARTNER_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const PARTNER_RATE_LIMIT_MAX = 30;

// Expensive-verification quota, per partner, separate from the general
// traffic bucket above - this is what actually gates cost (grounding/AI),
// not just request volume. lib/rateLimit.ts is an in-memory, per-process
// counter (see its own header) with no durable cross-instance storage;
// a 24h window here is therefore a best-effort, per-process approximation,
// not a real daily quota guarantee - explicitly acceptable per P5.5's
// scope as a conservative, documented, temporary bound rather than faked
// persistence. A real quota system (durable, cross-instance) is P5.5+
// follow-up work if partner volume ever makes this matter.
const PARTNER_VERIFY_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const PARTNER_VERIFY_QUOTA_MAX = 20;

const URL_FETCH_FAILURE_MESSAGES: Record<string, string> = {
  malformed_url: "That doesn't look like a valid URL.",
  unsupported_scheme: "Only http:// and https:// URLs are supported.",
  url_contains_credentials: "URLs with a username or password are not supported.",
  dns_resolution_failed: "That URL's host could not be resolved.",
  resolves_to_disallowed_address: "That URL points to an address VeriVerse cannot fetch.",
  invalid_redirect: "That page's redirect could not be followed safely.",
  too_many_redirects: "That page redirected too many times.",
  timeout: "That page took too long to respond.",
  response_too_large: "That page's response was too large to process.",
  unsupported_content_type: "That URL did not return a supported HTML page.",
  upstream_error: "That page could not be retrieved.",
  fetch_failed: "That page could not be retrieved.",
};

// Identical to app/api/verify/route.ts's own classify() - the AI
// screening step is mode-agnostic and belongs to neither Text nor URL
// mode specifically, so both existing callers and this one share the
// exact same call shape (retry + timeout policy included). Not extracted
// into lib/externalVerification.ts because it runs BEFORE this route
// decides resolutionText, i.e. it is an input to orchestration, not part
// of it - the same relationship it has in the existing route.
async function classify(cleanedText: string) {
  const screening = await withRetry(
    () => withTimeout(screenContentWithAI(cleanedText), 8_000, "AI screening"),
    { maxAttempts: 2, baseDelayMs: 300, label: "AI screening" }
  );
  return {
    contentType: screening.contentType ?? "claim",
    extractedClaim: screening.extractedClaim ?? null,
  };
}

// A lookup_only key must never reach runExpensiveVerification -
// hasRequester returning false unconditionally is what guarantees that
// structurally (see lib/externalVerification.ts's own comment on this
// seam), not a check inside authorize() that could be bypassed by a
// caller reaching authorize() some other way. A verify-capable key's
// authorize() enforces only the partner's own quota - no user identity
// check applies here, since there is no user; the partner key itself is
// the identity already established by getPartnerIdentity.
function buildPartnerAuthorizer(partner: PartnerIdentity): ExpensiveVerificationAuthorizer {
  return {
    hasRequester: () => partner.capability === "verify",
    authorize: async () => {
      const quotaResponse = enforceRateLimit({
        key: `partner_verify_quota:${partner.partnerId}`,
        windowMs: PARTNER_VERIFY_QUOTA_WINDOW_MS,
        max: PARTNER_VERIFY_QUOTA_MAX,
        message: "Daily verification quota exceeded for this API key.",
      });
      if (quotaResponse) return { authorized: false, response: quotaResponse };
      return { authorized: true };
    },
  };
}

type PartnerAssessment = {
  band: string;
  confidence: string;
  explanation: string;
} | null;

// Reshapes the shared orchestration's internal web-app response shape
// into the small, stable, explicitly versioned external contract - never
// passes through identityKey, similarity scores, AI-risk fields, raw
// TrustAssessment reason arrays, evidence authority scores, or any
// DNS/IP/fetch internal (none of those are even present in the internal
// shape to begin with - resolveOrVerifyClaim's own payload is already
// external-safe; this adapter's job is re-shaping and versioning, not
// redacting a leakier internal shape). An error/rate-limit Response
// (anything other than 200) is already a safe fail()-shaped body and is
// passed through unchanged rather than re-wrapped.
async function toPartnerResponse(response: Response, partner: PartnerIdentity): Promise<Response> {
  if (response.status !== 200) return response;

  const body = await response.json();

  // A second, cheap, indexed lookup rather than threading a richer return
  // type through resolveOrVerifyClaim/buildPayload - deliberately keeps
  // lib/externalVerification.ts's diff limited to the authorizer seam
  // above. Never re-runs grounding/AI; Claim.findById + a
  // TrustAssessment.findOne on an existing compound index.
  let assessment: PartnerAssessment = null;
  if (body.claimId && body.assessmentStatus === "available") {
    const { currentAssessment } = await getAuthoritativeClaimAssessment(body.claimId);
    if (currentAssessment) {
      const supportingCount = (currentAssessment.supportingEvidenceIds || []).length;
      const contradictingCount = (currentAssessment.contradictingEvidenceIds || []).length;
      const contextCount = (currentAssessment.unresolvedEvidenceIds || []).length;
      assessment = {
        band: currentAssessment.assessmentBand,
        confidence: currentAssessment.verificationConfidence?.level || "low",
        explanation: getClaimSummarySentence(currentAssessment.assessmentBand, {
          supportingCount,
          contradictingCount,
          contextCount,
        }),
      };
    }
  }

  return NextResponse.json({
    apiVersion: "v1",
    contentType: body.contentType,
    extractedClaim: body.extractedClaim,
    claimId: body.claimId,
    resolution: body.resolution,
    assessmentStatus: body.assessmentStatus,
    verificationRequired: body.verificationRequired,
    // P5.5 item 16: a lookup_only key seeing verificationRequired:true must
    // be told plainly that it cannot itself trigger that verification -
    // never a silent/automatic fallback into the expensive path.
    verificationPermitted: partner.capability === "verify",
    canonicalClaimUrl: body.canonicalClaimUrl,
    assessment,
    ...(typeof body.submittedUrl === "string"
      ? { submittedUrl: body.submittedUrl, finalUrl: body.finalUrl, pageTitle: body.pageTitle ?? null }
      : {}),
  });
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  let partner: PartnerIdentity | null = null;
  let mode: "text" | "url" | null = null;

  try {
    partner = getPartnerIdentity(req);
    if (!partner) return fail("Missing or invalid API key.", 401);

    const partnerLimitResponse = enforceRateLimit({
      key: `partner_api:${partner.partnerId}`,
      windowMs: PARTNER_RATE_LIMIT_WINDOW_MS,
      max: PARTNER_RATE_LIMIT_MAX,
      message: "Too many requests for this API key. Please slow down.",
    });
    if (partnerLimitResponse) return partnerLimitResponse;

    await connectDB();

    const body = await req.json();
    const hasText = typeof body.text === "string" && body.text.trim().length > 0;
    const hasUrl = typeof body.url === "string" && body.url.trim().length > 0;

    if (hasText === hasUrl) {
      return fail("Provide exactly one of text or url.", 400);
    }

    const authorizer = buildPartnerAuthorizer(partner);
    let rawResponse: Response;

    if (hasText) {
      mode = "text";
      const cleanedText = cleanString(body.text, { maxLength: MAX_TEXT_LENGTH });
      if (!cleanedText) {
        return fail(`Text is required and must be under ${MAX_TEXT_LENGTH} characters.`, 400);
      }

      // Same content->groundingQuery routing decision Text mode uses (see
      // app/api/verify/route.ts's own comment) - a "claim" always grounds
      // against the raw content, not the classifier's extractedClaim.
      const { contentType, extractedClaim } = await classify(cleanedText);
      const groundingPlan = resolveGroundingPlan({ content: cleanedText, contentType, extractedClaim });
      const resolutionText = groundingPlan.skipGrounding ? null : groundingPlan.groundingQuery;

      rawResponse = await resolveOrVerifyClaim({ req, resolutionText, contentType, extractedClaim, authorizer });
    } else {
      mode = "url";
      const rawUrl = body.url.trim();
      const fetchResult = await fetchPublicHtml(rawUrl);
      if (!fetchResult.ok) {
        return fail(URL_FETCH_FAILURE_MESSAGES[fetchResult.reason] || "That URL could not be verified.", 422);
      }

      const { title, text } = extractArticleContent(fetchResult.html);
      const candidateText = [title, text].filter(Boolean).join(". ").trim();
      const urlExtra = {
        submittedUrl: rawUrl,
        finalUrl: fetchResult.finalUrl,
        pageTitle: title,
      };

      if (!candidateText) {
        rawResponse = NextResponse.json({
          success: true,
          contentType: "instruction",
          extractedClaim: null,
          claimId: null,
          resolution: "no_claim_found",
          assessmentStatus: "assessment_not_available",
          canonicalClaimUrl: null,
          verificationRequired: false,
          ...urlExtra,
        });
      } else {
        // Deliberately diverges from Text mode's groundingQuery choice for
        // the same reason app/api/verify/route.ts's URL branch does - an
        // extracted article excerpt is too variable to hash directly for
        // Claim identity; prefer the classifier's distilled claim when
        // available.
        const { contentType, extractedClaim } = await classify(candidateText);
        const resolutionText =
          contentType === "question" || contentType === "instruction" ? null : extractedClaim || candidateText;

        rawResponse = await resolveOrVerifyClaim({
          req,
          resolutionText,
          contentType,
          extractedClaim,
          extra: urlExtra,
          authorizer,
        });
      }
    }

    const partnerResponse = await toPartnerResponse(rawResponse, partner);

    // Safe operational log only - partner identity, mode, status, and
    // duration. Never the raw API key, submitted text, or article body
    // (see lib/partnerAuth.ts's own comment on why the key never appears
    // in any log). Matches the one existing console.info convention in
    // this codebase (app/api/password/forgot/route.ts).
    console.info("Partner verify request", {
      partnerId: partner.partnerId,
      capability: partner.capability,
      mode,
      status: partnerResponse.status,
      durationMs: Date.now() - startedAt,
    });

    return partnerResponse;
  } catch {
    console.info("Partner verify request", {
      partnerId: partner?.partnerId ?? null,
      capability: partner?.capability ?? null,
      mode,
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return fail("Failed to process verification request", 500);
  }
}
