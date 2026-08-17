import { describe, expect, it } from "vitest";
import { calculateVerificationScore } from "@/lib/groundingMetrics";

describe("verification score", () => {
  it("increases when supporting evidence and confidence are present", () => {
    const score = calculateVerificationScore(
      {
        groundingConfidence: 60,
        contradictionCount: 0,
        supportCount: 2,
        contextCount: 1,
      },
      "checked"
    );

    expect(score).toBe(68);
  });

  it("drops sharply when contradictory evidence outweighs support", () => {
    const score = calculateVerificationScore(
      {
        groundingConfidence: 60,
        contradictionCount: 2,
        supportCount: 0,
        contextCount: 0,
      },
      "checked"
    );

    expect(score).toBe(0);
  });

  it("penalizes insufficient evidence even when some context exists", () => {
    const score = calculateVerificationScore(
      {
        groundingConfidence: 20,
        contradictionCount: 0,
        supportCount: 0,
        contextCount: 2,
      },
      "insufficient_evidence"
    );

    expect(score).toBe(11);
  });
});