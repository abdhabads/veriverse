import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

type GuardOptions = {
  key: string;
  windowMs: number;
  max: number;
  message?: string;
};

export function enforceRateLimit(options: GuardOptions) {
  // Skip rate limiting in test environment to prevent cross-test interference
  if (process.env.NODE_ENV === "test") return null;

  const result = checkRateLimit(options.key, {
    windowMs: options.windowMs,
    max: options.max,
  });

  if (!result.allowed) {
    return NextResponse.json(
      {
        success: false,
        message:
          options.message || "Too many requests. Please try again later.",
        retryAfterMs: Math.max(0, result.resetAt - Date.now()),
      },
      { status: 429 }
    );
  }

  return null;
}
