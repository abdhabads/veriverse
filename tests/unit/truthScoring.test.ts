import { describe, expect, it } from "vitest";
import { applyGroundingRiskFloor, mapRiskToLabel } from "@/lib/truthScoring";

describe("truth scoring", () => {
  it("raises contradicted low-risk claims to needs review when confidence is moderate", () => {
    const score = applyGroundingRiskFloor({
      baseScore: 8,
      contradictionCount: 1,
      groundingConfidence: 50,
      groundingStatus: "checked",
    });

    expect(score).toBe(45);
    expect(mapRiskToLabel(score)).toBe("needs_review");
  });

  it("raises strongly contradicted claims to high risk", () => {
    const score = applyGroundingRiskFloor({
      baseScore: 12,
      contradictionCount: 2,
      groundingConfidence: 70,
      groundingStatus: "checked",
    });

    expect(score).toBe(75);
    expect(mapRiskToLabel(score)).toBe("high_risk");
  });

  it("keeps non-contradicted content unchanged", () => {
    const score = applyGroundingRiskFloor({
      baseScore: 12,
      contradictionCount: 0,
      groundingConfidence: 70,
      groundingStatus: "checked",
    });

    expect(score).toBe(12);
    expect(mapRiskToLabel(score)).toBe("safe");
  });
});