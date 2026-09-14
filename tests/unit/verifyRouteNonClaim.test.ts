// tests/unit/verifyRouteNonClaim.test.ts
//
// P5.1: covers the one required behavioral case
// (tests/e2e/verify-text.spec.ts's siblings cover the rest) that cannot be
// naturally exercised end-to-end in this test environment: AI_ENABLED=false
// makes screenContentWithAI's local fallback always return
// contentType:"claim" (see lib/aiModeration.ts's own comment - "losing the
// AI classifier never silently exempts content from verification"), so a
// live HTTP call can never observe a question/instruction classification
// here. Mocking screenContentWithAI lets this test exercise the ACTUAL
// route logic (not a reimplementation of it) under a classification result
// the live environment can't otherwise produce.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import Claim from "@/models/Claim";

vi.mock("@/lib/aiModeration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aiModeration")>();
  return {
    ...actual,
    screenContentWithAI: vi.fn(async () => ({
      aiLabel: "safe" as const,
      aiRiskScore: 0,
      moderationReasons: [],
      provider: "fallback" as const,
      contentType: "question" as const,
      extractedClaim: null,
    })),
  };
});

const uri = process.env.MONGO_URI;

beforeAll(async () => {
  if (!uri) throw new Error("MONGO_URI is not set");
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/verify - non-claim classification", () => {
  it("returns a safe no-claim response with zero persistence when classified as a question/instruction", async () => {
    const { POST } = await import("@/app/api/verify/route");
    const text = `What time is it right now ${new mongoose.Types.ObjectId()}?`;
    const claimCountBefore = await Claim.countDocuments({});

    const res = await POST(makeRequest({ text }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.contentType).toBe("question");
    expect(body.extractedClaim).toBeNull();
    expect(body.claimId).toBeNull();
    expect(body.resolution).toBe("no_claim_found");
    expect(body.assessmentStatus).toBe("assessment_not_available");
    expect(body.canonicalClaimUrl).toBeNull();
    expect(body.verificationRequired).toBe(false);

    expect(await Claim.countDocuments({})).toBe(claimCountBefore);
  });
});
