// app/api/verify/route.ts
//
// P5.1/P5.2: the external-VeriVerse entry point. Answers "what does
// VeriVerse know about this claim?" for either a pasted text submission or
// a public webpage URL, without requiring a Post to exist and without ever
// creating one. Both modes ultimately share the exact same
// classify -> read-only resolve -> reuse-an-existing-assessment ->
// auth-gated expensive verification orchestration
// (lib/externalVerification.ts) - only the classification INPUT differs:
// Text grounds against the raw submission (matching
// lib/contentTypeRouting.ts's own routing rule); URL grounds against a
// bounded, safely-fetched article excerpt.
//
// Post creation is deliberately absent from this entire file. It never
// imports models/Post and never calls POST /api/posts. Publishing stays a
// separate, explicit, already-existing user action.
import { connectDB } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { screenContentWithAI } from "@/lib/aiModeration";
import { resolveGroundingPlan } from "@/lib/contentTypeRouting";
import { resolveOrVerifyClaim } from "@/lib/externalVerification";
import { fetchPublicHtml } from "@/lib/boundedFetch";
import { extractArticleContent } from "@/lib/articleExtraction";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanString } from "@/lib/validation";
import { withRetry, withTimeout } from "@/lib/withRetry";
import { ok, fail } from "@/lib/apiResponse";

// Mirrors Post.content's own existing limit (app/api/posts/route.ts) -
// no code evidence justifies a different boundary for a direct text
// verification submission.
const MAX_TEXT_LENGTH = 1000;

// P5.2: article extraction is deliberately bounded well above
// MAX_TEXT_LENGTH (see lib/articleExtraction.ts's own comment) - an
// article needs more surrounding text than a single Post for the existing
// classifier to find the actual assertion, but it is still a small, hard
// cap, never "the whole page."
const FETCH_URL_RATE_LIMIT_MAX = 10;
const FETCH_URL_RATE_LIMIT_WINDOW_MS = 60 * 1000;

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

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();
    const hasText = typeof body.text === "string" && body.text.trim().length > 0;
    const hasUrl = typeof body.url === "string" && body.url.trim().length > 0;

    if (hasText === hasUrl) {
      return fail("Provide exactly one of text or url.", 400);
    }

    if (hasText) {
      const cleanedText = cleanString(body.text, { maxLength: MAX_TEXT_LENGTH });
      if (!cleanedText) {
        return fail(`Text is required and must be under ${MAX_TEXT_LENGTH} characters.`, 400);
      }

      // Reuses the exact same content->groundingQuery routing decision
      // (resolveGroundingPlan) the real pipeline uses, so the text this
      // route resolves identity against is provably the same text
      // evaluateContentTruthPipeline would later resolve identity against -
      // see lib/contentTypeRouting.ts's own comment that a "claim" always
      // grounds against the raw content, not the classifier's
      // extractedClaim field.
      const { contentType, extractedClaim } = await classify(cleanedText);
      const groundingPlan = resolveGroundingPlan({ content: cleanedText, contentType, extractedClaim });
      const resolutionText = groundingPlan.skipGrounding ? null : groundingPlan.groundingQuery;

      return await resolveOrVerifyClaim({ req, resolutionText, contentType, extractedClaim });
    }

    // URL mode. A dedicated, distinct rate-limit bucket gates the
    // acquisition (fetch + parse) step itself - separate from
    // "verify_text", which only ever gates the expensive AI/grounding step
    // inside resolveOrVerifyClaim. Fetching an arbitrary URL is real cost
    // and a real abuse surface (a network request to a third party) even
    // when it never reaches that expensive step, so it is bounded on its
    // own, for every caller, anonymous included - matching the P5.1 policy
    // that anonymous read/lookup remains available, just not unbounded.
    const requesterIdForRateLimit = getUserIdFromRequest(req);
    const fetchLimitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "verify_url_fetch", requesterIdForRateLimit),
      windowMs: FETCH_URL_RATE_LIMIT_WINDOW_MS,
      max: FETCH_URL_RATE_LIMIT_MAX,
      message: "You are submitting URLs too quickly. Please slow down.",
    });
    if (fetchLimitResponse) return fetchLimitResponse;

    const rawUrl = body.url.trim();
    const fetchResult = await fetchPublicHtml(rawUrl);
    if (!fetchResult.ok) {
      return fail(URL_FETCH_FAILURE_MESSAGES[fetchResult.reason] || "That URL could not be verified.", 422);
    }

    const { title, text } = extractArticleContent(fetchResult.html);
    const candidateText = [title, text].filter(Boolean).join(". ").trim();

    // Safe, product-useful fields specific to URL mode - never resolved IP
    // addresses, redirect-chain internals, fetch headers, or DNS details
    // (see lib/boundedFetch.ts, which never returns any of those to begin
    // with). The URL itself is never persisted here - only request-scoped,
    // returned to the caller and otherwise discarded unless the existing
    // Claim verification pipeline itself goes on to create a Claim from
    // the derived text, exactly as Text mode already does.
    const urlExtra = {
      submittedUrl: rawUrl,
      finalUrl: fetchResult.finalUrl,
      pageTitle: title,
    };

    if (!candidateText) {
      // A safely-fetched page with no usable text at all - the safe
      // no-claim response, not an error, and no persistence of any kind.
      return ok({
        contentType: "instruction",
        extractedClaim: null,
        claimId: null,
        resolution: "no_claim_found",
        assessmentStatus: "assessment_not_available",
        canonicalClaimUrl: null,
        verificationRequired: false,
        ...urlExtra,
      });
    }

    const { contentType, extractedClaim } = await classify(candidateText);
    // Deliberately diverges from Text mode's groundingQuery choice: an
    // extracted article excerpt is a multi-paragraph blob, not a single
    // claim sentence, so hashing the whole excerpt for Claim identity
    // would make two articles about the identical fact resolve to
    // different Claims almost every time. Preferring extractedClaim (the
    // classifier's own distilled assertion) when available keeps identity
    // resolution meaningful; falling back to the (still bounded) excerpt
    // only when the classifier found "claim" content but could not
    // isolate one. This same resolutionText is reused unchanged if
    // expensive verification is needed, so the pipeline's own fresh
    // classification of it stays consistent with this route's read-only
    // pre-check - see lib/externalVerification.ts's header comment.
    const resolutionText =
      contentType === "question" || contentType === "instruction"
        ? null
        : extractedClaim || candidateText;

    return await resolveOrVerifyClaim({ req, resolutionText, contentType, extractedClaim, extra: urlExtra });
  } catch {
    return fail("Failed to process verification request", 500);
  }
}
