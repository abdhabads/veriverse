// tests/unit/partnerRateLimit.test.ts
//
// P5.5: proves the Partner API's two rate/quota buckets - general traffic
// ("partner_api:<partnerId>") and expensive-verification quota
// ("partner_verify_quota:<partnerId>") - behave correctly as buckets, and
// stay isolated from each other and from a different partner's buckets.
//
// This deliberately tests lib/rateLimit.ts's checkRateLimit directly
// rather than going through the route: lib/rateLimitGuard.ts's
// enforceRateLimit is a no-op whenever NODE_ENV=test (see its own
// comment), which this project's vitest config sets for every unit test -
// the same reason the existing verify_text/verify_url_fetch buckets are
// only ever exercised live (Playwright e2e), never in vitest. Testing the
// underlying bucket function directly, with the exact key scheme and
// limits app/api/v1/verify/route.ts uses, is the focused, offline-runnable
// equivalent for this phase.
import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

function uniqueKey(prefix: string): string {
  return `${prefix}:${Math.random().toString(36).slice(2)}`;
}

describe("Partner API rate-limit bucket (partner_api:<partnerId>)", () => {
  it("allows requests up to the configured max, then blocks the next one", () => {
    const key = uniqueKey("partner_api");
    const max = 30;
    const windowMs = 60_000;

    for (let i = 0; i < max; i++) {
      const result = checkRateLimit(key, { windowMs, max });
      expect(result.allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, { windowMs, max });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("keeps two different partners' buckets fully isolated", () => {
    const keyA = "partner_api:partner-a-" + Math.random().toString(36).slice(2);
    const keyB = "partner_api:partner-b-" + Math.random().toString(36).slice(2);
    const options = { windowMs: 60_000, max: 1 };

    expect(checkRateLimit(keyA, options).allowed).toBe(true);
    // Partner A is now exhausted, but partner B's own bucket is untouched.
    expect(checkRateLimit(keyA, options).allowed).toBe(false);
    expect(checkRateLimit(keyB, options).allowed).toBe(true);
  });
});

describe("Partner API expensive-verification quota (partner_verify_quota:<partnerId>)", () => {
  it("allows verifications up to the daily max, then blocks further ones", () => {
    const key = uniqueKey("partner_verify_quota");
    const max = 20;
    const windowMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < max; i++) {
      expect(checkRateLimit(key, { windowMs, max }).allowed).toBe(true);
    }
    expect(checkRateLimit(key, { windowMs, max }).allowed).toBe(false);
  });

  it("is a separate bucket namespace from the general traffic bucket for the same partner", () => {
    const partnerId = "same-partner-" + Math.random().toString(36).slice(2);
    const trafficKey = `partner_api:${partnerId}`;
    const quotaKey = `partner_verify_quota:${partnerId}`;

    // Exhaust the (small, test-local) traffic bucket for this partner...
    for (let i = 0; i < 30; i++) checkRateLimit(trafficKey, { windowMs: 60_000, max: 30 });
    expect(checkRateLimit(trafficKey, { windowMs: 60_000, max: 30 }).allowed).toBe(false);

    // ...and confirm the quota bucket for the SAME partner is unaffected.
    expect(checkRateLimit(quotaKey, { windowMs: 24 * 60 * 60 * 1000, max: 20 }).allowed).toBe(true);
  });

  it("is a separate bucket namespace from the web app's own verify_text bucket even for the same key material", () => {
    // Guards against an accidental key-scheme collision between the
    // partner quota bucket and the existing human verify_text bucket -
    // they must never be able to share or exhaust each other's counters.
    const sharedSuffix = "collision-check-" + Math.random().toString(36).slice(2);
    const humanKey = `verify_text:user:${sharedSuffix}`;
    const partnerKey = `partner_verify_quota:${sharedSuffix}`;

    for (let i = 0; i < 5; i++) checkRateLimit(humanKey, { windowMs: 60_000, max: 5 });
    expect(checkRateLimit(humanKey, { windowMs: 60_000, max: 5 }).allowed).toBe(false);
    expect(checkRateLimit(partnerKey, { windowMs: 24 * 60 * 60 * 1000, max: 20 }).allowed).toBe(true);
  });
});
