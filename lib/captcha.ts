import { logEvent } from "@/lib/logger";

type CaptchaVerificationResult = {
  success: boolean;
  message?: string;
};

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare Turnstile Siteverify's own documented response shape. Only
// "success" is required to trust; everything else is optional/best-effort
// and must be treated defensively (never assume shape).
type SiteverifyResponse = {
  success?: unknown;
  ["error-codes"]?: unknown;
};

function isSiteverifyResponse(value: unknown): value is SiteverifyResponse {
  return typeof value === "object" && value !== null && "success" in value;
}

// Real Cloudflare Turnstile verification, replacing the previous
// human-verified placeholder. Fails closed on every ambiguous or
// unexpected condition - a captcha check that can be bypassed by a
// misconfiguration or a network hiccup is worse than no captcha at all.
//
// remoteIp is optional and only used if the caller already has it from
// existing request-identity plumbing (lib/requestIdentity.ts) - this
// function never fetches or derives it itself.
export async function verifyCaptchaToken(
  token: string | undefined | null,
  remoteIp?: string | null
): Promise<CaptchaVerificationResult> {
  const enabled = process.env.CAPTCHA_ENABLED === "true";

  if (!enabled) {
    return { success: true };
  }

  if (!token || !token.trim()) {
    return {
      success: false,
      message: "Captcha verification is required.",
    };
  }

  const secret = process.env.CAPTCHA_SECRET_KEY;
  if (!secret) {
    // Configuration error, not a user error - CAPTCHA_ENABLED=true with no
    // secret key means verification can never succeed by design. Log it
    // distinctly so this looks like a deploy misconfiguration in logs, not
    // a wave of legitimate users failing captcha. Never bypass silently.
    logEvent("CAPTCHA_CONFIG_ERROR", {
      reason: "CAPTCHA_ENABLED is true but CAPTCHA_SECRET_KEY is not set",
    });
    return {
      success: false,
      message: "Captcha verification is temporarily unavailable. Please try again shortly.",
    };
  }

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (remoteIp) {
    params.set("remoteip", remoteIp);
  }

  let response: Response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (error) {
    logEvent("CAPTCHA_VERIFY_NETWORK_ERROR", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: "Captcha verification failed. Please try again.",
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    logEvent("CAPTCHA_VERIFY_MALFORMED_RESPONSE", {
      httpStatus: response.status,
      reason: "response body was not valid JSON",
    });
    return {
      success: false,
      message: "Captcha verification failed. Please try again.",
    };
  }

  if (!isSiteverifyResponse(parsed) || typeof parsed.success !== "boolean") {
    logEvent("CAPTCHA_VERIFY_MALFORMED_RESPONSE", {
      httpStatus: response.status,
      reason: "response missing a boolean 'success' field",
    });
    return {
      success: false,
      message: "Captcha verification failed. Please try again.",
    };
  }

  if (!parsed.success) {
    const errorCodes = Array.isArray(parsed["error-codes"]) ? parsed["error-codes"] : [];
    // Sanitized: Cloudflare's own short error codes only (e.g.
    // "timeout-or-duplicate", "invalid-input-response") - never the token
    // itself, never the secret.
    logEvent("CAPTCHA_VERIFY_REJECTED", { errorCodes });
    return {
      success: false,
      message: "Captcha verification failed. Please try again.",
    };
  }

  return { success: true };
}
