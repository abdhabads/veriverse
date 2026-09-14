// tests/unit/partnerVerifyApi.test.ts
//
// P5.5: integration-level tests (real local test MongoDB, same pattern as
// tests/unit/trendingClaimsIntegration.test.ts and
// tests/unit/verifyRouteNonClaim.test.ts) for the Partner API route,
// calling the ACTUAL route handler - never a reimplementation of its
// logic. screenContentWithAI, evaluateContentTruthPipeline, and
// fetchPublicHtml are mocked so no test here spends real AI/Tavily/network
// cost or depends on a live third-party page (matches the P5.5 lean-
// validation instruction to prevent external cost during tests).
//
// Rate-limit/quota behavior (lib/rateLimit.ts) is deliberately NOT
// exercised here: lib/rateLimitGuard.ts's enforceRateLimit is a no-op
// whenever NODE_ENV=test (see its own comment - "prevent cross-test
// interference"), which this project's vitest config sets via
// .env.test.local for every unit test, exactly as it already does for the
// existing verify_text/verify_url_fetch buckets (those are only ever
// exercised live, in Playwright e2e). partnerRateLimit.test.ts covers the
// underlying bucket mechanism directly instead.
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Claim from "@/models/Claim";
import TrustAssessment from "@/models/TrustAssessment";
import Post from "@/models/Post";
import { findOrCreateClaim } from "@/lib/claimIdentity";

vi.mock("@/lib/aiModeration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aiModeration")>();
  return { ...actual, screenContentWithAI: vi.fn() };
});
vi.mock("@/lib/aiTruthPipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aiTruthPipeline")>();
  return { ...actual, evaluateContentTruthPipeline: vi.fn() };
});
vi.mock("@/lib/boundedFetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/boundedFetch")>();
  return { ...actual, fetchPublicHtml: vi.fn() };
});

import { screenContentWithAI } from "@/lib/aiModeration";
import { evaluateContentTruthPipeline } from "@/lib/aiTruthPipeline";
import { fetchPublicHtml } from "@/lib/boundedFetch";

const uri = process.env.MONGO_URI;
const LOOKUP_KEY = "test_lookup_key_" + Math.random().toString(36).slice(2);
const VERIFY_KEY = "test_verify_key_" + Math.random().toString(36).slice(2);
const LOOKUP_PARTNER_ID = "test-partner-lookup";
const VERIFY_PARTNER_ID = "test-partner-verify";
let originalPartnerKeysEnv: string | undefined;

let claimIds: mongoose.Types.ObjectId[] = [];

function track(claim: any) {
  claimIds.push(claim._id);
  return claim;
}

async function makeAssessedClaim(overrides: Record<string, unknown> = {}) {
  const { claim } = await findOrCreateClaim(`Partner API test claim ${new mongoose.Types.ObjectId()}`);
  track(claim);
  await TrustAssessment.create({
    claim: claim._id,
    claimAssessmentVersion: 1,
    evidenceStrength: { band: "moderate", score: 1, confidence: 1, independentSupportingCount: 2 },
    contradictionStrength: { band: "none", directCount: 0, weakCount: 0, confidence: 1 },
    verificationConfidence: { level: "medium", score: 1 },
    assessmentBand: "well_supported",
    supportingEvidenceIds: [],
    contradictingEvidenceIds: [],
    unresolvedEvidenceIds: [],
    modelVersion: "test",
    ...overrides,
  });
  await Claim.updateOne({ _id: claim._id }, { currentAssessmentVersion: 1 });
  return claim;
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("http://localhost/api/v1/verify", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function mockClassifyAsClaim(extractedClaim: string | null = null) {
  (screenContentWithAI as any).mockResolvedValue({
    aiLabel: "safe",
    aiRiskScore: 0,
    moderationReasons: [],
    provider: "fallback",
    contentType: "claim",
    extractedClaim,
  });
}

beforeAll(async () => {
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
  originalPartnerKeysEnv = process.env.PARTNER_API_KEYS;
  process.env.PARTNER_API_KEYS = [
    `${LOOKUP_PARTNER_ID}:${LOOKUP_KEY}:lookup_only`,
    `${VERIFY_PARTNER_ID}:${VERIFY_KEY}:verify`,
  ].join(",");
});

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    Claim.deleteMany({ _id: { $in: claimIds } }),
    TrustAssessment.deleteMany({ claim: { $in: claimIds } }),
  ]);
  claimIds = [];
});

afterAll(async () => {
  process.env.PARTNER_API_KEYS = originalPartnerKeysEnv;
  await mongoose.disconnect();
});

describe("POST /api/v1/verify - authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({ text: "Some claim" }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong auth scheme", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({ text: "Some claim" }, `Basic ${LOOKUP_KEY}`));
    expect(res.status).toBe(401);
  });

  it("rejects a request with an unrecognized key", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({ text: "Some claim" }, "Bearer not-a-real-key"));
    expect(res.status).toBe(401);
  });

  it("never echoes the presented key back in the error body", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({ text: "Some claim" }, "Bearer totally-invalid-secret-value"));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("totally-invalid-secret-value");
  });
});

describe("POST /api/v1/verify - input contract", () => {
  it("rejects a request with neither text nor url", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({}, `Bearer ${LOOKUP_KEY}`));
    expect(res.status).toBe(400);
  });

  it("rejects a request with both text and url", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(
      makeRequest({ text: "Some claim", url: "https://example.com/" }, `Bearer ${LOOKUP_KEY}`)
    );
    expect(res.status).toBe(400);
  });

  it("rejects oversized text rather than truncating it", async () => {
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({ text: "a".repeat(1500) }, `Bearer ${LOOKUP_KEY}`));
    expect(res.status).toBe(400);
  });

  it("reports a malformed/unsafe URL as 422 without a partial success shape", async () => {
    (fetchPublicHtml as any).mockResolvedValue({ ok: false, reason: "resolves_to_disallowed_address" });
    const { POST } = await import("@/app/api/v1/verify/route");
    const res = await POST(makeRequest({ url: "http://169.254.169.254/" }, `Bearer ${LOOKUP_KEY}`));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/verify - lookup_only capability", () => {
  it("returns the current assessment for an existing assessed claim", async () => {
    const claim = await makeAssessedClaim();
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");

    const res = await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${LOOKUP_KEY}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.apiVersion).toBe("v1");
    expect(body.claimId).toBe(String(claim._id));
    expect(body.resolution).toBe("existing");
    expect(body.assessmentStatus).toBe("available");
    expect(body.verificationRequired).toBe(false);
    expect(body.assessment).toEqual({
      band: "well_supported",
      confidence: "medium",
      explanation: expect.any(String),
    });
    expect(evaluateContentTruthPipeline).not.toHaveBeenCalled();
  });

  it("never verifies a novel claim - reports verificationRequired without running the pipeline", async () => {
    const text = `Never-before-seen partner claim ${new mongoose.Types.ObjectId()}`;
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");
    const claimCountBefore = await Claim.countDocuments({});

    const res = await POST(makeRequest({ text }, `Bearer ${LOOKUP_KEY}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.claimId).toBeNull();
    expect(body.resolution).toBe("new");
    expect(body.assessmentStatus).toBe("assessment_not_available");
    expect(body.verificationRequired).toBe(true);
    expect(body.verificationPermitted).toBe(false);
    expect(body.assessment).toBeNull();
    expect(evaluateContentTruthPipeline).not.toHaveBeenCalled();
    expect(await Claim.countDocuments({})).toBe(claimCountBefore);
  });

  it("never verifies an existing but not-yet-assessed claim either", async () => {
    const { claim } = await findOrCreateClaim(`Unassessed partner claim ${new mongoose.Types.ObjectId()}`);
    track(claim);
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");

    const res = await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${LOOKUP_KEY}`));
    const body = await res.json();

    expect(body.claimId).toBe(String(claim._id));
    expect(body.resolution).toBe("existing");
    expect(body.verificationRequired).toBe(true);
    expect(body.verificationPermitted).toBe(false);
    expect(evaluateContentTruthPipeline).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/verify - verify capability", () => {
  it("reuses an existing assessed claim exactly like a lookup_only key would, without re-verifying", async () => {
    const claim = await makeAssessedClaim();
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");

    const res = await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${VERIFY_KEY}`));
    const body = await res.json();

    expect(body.claimId).toBe(String(claim._id));
    expect(body.resolution).toBe("existing");
    expect(body.verificationRequired).toBe(false);
    expect(body.verificationPermitted).toBe(true);
    expect(evaluateContentTruthPipeline).not.toHaveBeenCalled();
  });

  it("enters the real verification path for a novel claim, via the actual shared pipeline function", async () => {
    const text = `Verify-capable novel claim ${new mongoose.Types.ObjectId()}`;
    mockClassifyAsClaim();
    const fakeClaimId = new mongoose.Types.ObjectId().toString();
    (evaluateContentTruthPipeline as any).mockResolvedValue({
      contentType: "claim",
      extractedClaim: text,
      claimId: fakeClaimId,
      claimMatchTier: "new",
    });
    const { POST } = await import("@/app/api/v1/verify/route");

    const res = await POST(makeRequest({ text }, `Bearer ${VERIFY_KEY}`));
    const body = await res.json();

    expect(evaluateContentTruthPipeline).toHaveBeenCalledTimes(1);
    expect(evaluateContentTruthPipeline).toHaveBeenCalledWith(text);
    expect(body.claimId).toBe(fakeClaimId);
    expect(body.resolution).toBe("new");
    expect(body.verificationPermitted).toBe(true);
  });

  it("repeating a request for an already-assessed claim never advances its assessment version or duplicates evidence", async () => {
    const claim = await makeAssessedClaim();
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");

    const first = await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${VERIFY_KEY}`));
    const second = await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${VERIFY_KEY}`));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.claimId).toBe(secondBody.claimId);
    expect(evaluateContentTruthPipeline).not.toHaveBeenCalled();

    const refreshed = await Claim.findById(claim._id);
    expect(refreshed!.currentAssessmentVersion).toBe(1);
    expect(await TrustAssessment.countDocuments({ claim: claim._id })).toBe(1);
  });
});

describe("POST /api/v1/verify - URL mode reuses the shared acquisition path", () => {
  it("classifies extracted article text and resolves it the same way Text mode would", async () => {
    (fetchPublicHtml as any).mockResolvedValue({
      ok: true,
      html: "<html><head><title>Test Article</title></head><body><article>Some article body text</article></body></html>",
      finalUrl: "https://example.com/article",
    });
    mockClassifyAsClaim("The extracted claim");
    const { POST } = await import("@/app/api/v1/verify/route");

    const res = await POST(makeRequest({ url: "https://example.com/article" }, `Bearer ${LOOKUP_KEY}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.submittedUrl).toBe("https://example.com/article");
    expect(body.finalUrl).toBe("https://example.com/article");
    expect(body.pageTitle).toBe("Test Article");
  });
});

describe("POST /api/v1/verify - response field allowlist", () => {
  it("never exposes internal-only fields", async () => {
    const claim = await makeAssessedClaim();
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");

    const res = await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${LOOKUP_KEY}`));
    const body = await res.json();

    const forbiddenKeys = [
      "identityKey",
      "similarity",
      "similarityScore",
      "aiRiskScore",
      "aiLabel",
      "moderationReasons",
      "assessmentReasons",
      "evidenceStrength",
      "contradictionStrength",
      "modelVersion",
      "address",
      "resolvedAddress",
      "dnsAnswers",
    ];
    const serialized = JSON.stringify(body);
    for (const key of forbiddenKeys) {
      expect(serialized).not.toContain(key);
    }

    const allowedTopLevelKeys = new Set([
      "success",
      "apiVersion",
      "contentType",
      "extractedClaim",
      "claimId",
      "resolution",
      "assessmentStatus",
      "verificationRequired",
      "verificationPermitted",
      "canonicalClaimUrl",
      "assessment",
    ]);
    for (const key of Object.keys(body)) {
      expect(allowedTopLevelKeys.has(key)).toBe(true);
    }
  });
});

describe("POST /api/v1/verify - Post isolation", () => {
  it("never creates a Post in any capability/outcome combination", async () => {
    const claim = await makeAssessedClaim();
    mockClassifyAsClaim();
    const { POST } = await import("@/app/api/v1/verify/route");
    const postCountBefore = await Post.countDocuments({});

    await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${LOOKUP_KEY}`));
    await POST(makeRequest({ text: claim.canonicalText }, `Bearer ${VERIFY_KEY}`));
    await POST(
      makeRequest({ text: `Novel unposted claim ${new mongoose.Types.ObjectId()}` }, `Bearer ${LOOKUP_KEY}`)
    );

    expect(await Post.countDocuments({})).toBe(postCountBefore);
  });
});
