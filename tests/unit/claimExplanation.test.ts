// tests/unit/claimExplanation.test.ts
//
// P4.1: pure tests for getClaimExplanation - no DB, no AI, no network. Proves
// the explanation is built only from safe numeric/enum inputs (never the
// internal reasons arrays), that ordering is fixed (support -> contradiction
// -> uncertainty), that overlapping restatements never occur by
// construction, and that no raw internal score/threshold/jargon ever
// appears in any producible output string.
import { describe, it, expect } from "vitest";
import { getClaimExplanation, type ClaimExplanationInput } from "@/lib/claimPresentation";

function input(overrides: Partial<ClaimExplanationInput> = {}): ClaimExplanationInput {
  return {
    assessmentBand: "insufficient_evidence",
    independentSupportingCount: 0,
    directContradictionCount: 0,
    weakContradictionCount: 0,
    confidenceLevel: "low",
    ...overrides,
  };
}

describe("getClaimExplanation - determinism", () => {
  it("produces identical output for identical input", () => {
    const params = input({ assessmentBand: "well_supported", independentSupportingCount: 3 });
    expect(getClaimExplanation(params)).toEqual(getClaimExplanation(params));
  });
});

describe("getClaimExplanation - ordering", () => {
  it("orders reasons as support/evidence, then contradiction, then uncertainty", () => {
    const result = getClaimExplanation(
      input({
        assessmentBand: "contested",
        independentSupportingCount: 2,
        directContradictionCount: 1,
        confidenceLevel: "very_low",
      })
    );
    const types = result.reasons.map((r) => r.type);
    // support/evidence must come before contradiction, which must come
    // before uncertainty - never the reverse, regardless of how many of
    // each are present.
    const supportIndex = types.findIndex((t) => t === "support" || t === "evidence");
    const contradictionIndex = types.findIndex((t) => t === "contradiction");
    const uncertaintyIndex = types.findIndex((t) => t === "uncertainty");
    if (contradictionIndex >= 0) expect(supportIndex).toBeLessThan(contradictionIndex);
    if (uncertaintyIndex >= 0 && contradictionIndex >= 0) {
      expect(contradictionIndex).toBeLessThan(uncertaintyIndex);
    }
  });
});

describe("getClaimExplanation - support explanation", () => {
  it("describes zero supporting evidence honestly", () => {
    const result = getClaimExplanation(input({ independentSupportingCount: 0 }));
    expect(result.reasons[0]).toEqual({ type: "evidence", text: "No supporting evidence has been found." });
  });

  it("describes exactly one uncorroborated source distinctly from multiple", () => {
    const result = getClaimExplanation(input({ assessmentBand: "weakly_supported", independentSupportingCount: 1 }));
    expect(result.reasons[0].type).toBe("support");
    expect(result.reasons[0].text).toContain("one source");
    expect(result.reasons[0].text).toContain("not yet been independently corroborated");
  });

  it("describes multiple independent sources with the exact count", () => {
    const result = getClaimExplanation(input({ assessmentBand: "well_supported", independentSupportingCount: 4 }));
    expect(result.reasons[0]).toEqual({ type: "support", text: "Supported by 4 independent sources." });
  });
});

describe("getClaimExplanation - contradiction explanation", () => {
  it("omits a contradiction reason entirely when there is nothing to report", () => {
    const result = getClaimExplanation(
      input({ assessmentBand: "well_supported", independentSupportingCount: 3, directContradictionCount: 0, weakContradictionCount: 0 })
    );
    expect(result.reasons.some((r) => r.type === "contradiction")).toBe(false);
  });

  it("reports direct contradictions with correct singular/plural wording", () => {
    const singular = getClaimExplanation(input({ directContradictionCount: 1 }));
    const plural = getClaimExplanation(input({ directContradictionCount: 3 }));
    expect(singular.reasons.find((r) => r.type === "contradiction")!.text).toBe(
      "1 independent source directly contradicts this claim."
    );
    expect(plural.reasons.find((r) => r.type === "contradiction")!.text).toBe(
      "3 independent sources directly contradict this claim."
    );
  });

  it("reports weak/indirect disagreement distinctly from a direct contradiction, and never both at once", () => {
    const result = getClaimExplanation(input({ directContradictionCount: 0, weakContradictionCount: 2 }));
    const contradictionReasons = result.reasons.filter((r) => r.type === "contradiction");
    expect(contradictionReasons.length).toBe(1);
    expect(contradictionReasons[0].text).toContain("not strong enough to count as a direct contradiction");
  });
});

describe("getClaimExplanation - contested semantics", () => {
  it("makes disagreement visible without collapsing to a true/false/mostly-true verdict", () => {
    const result = getClaimExplanation(
      input({ assessmentBand: "contested", independentSupportingCount: 2, directContradictionCount: 2 })
    );
    expect(result.summary).toContain("Both substantial supporting and substantial contradicting evidence exist");
    expect(result.summary.toLowerCase()).not.toContain("true");
    expect(result.summary.toLowerCase()).not.toContain("false");
    expect(result.summary.toLowerCase()).not.toContain("mostly");
    // Both dimensions must be represented - disagreement stays visible.
    expect(result.reasons.some((r) => r.type === "support")).toBe(true);
    expect(result.reasons.some((r) => r.type === "contradiction")).toBe(true);
  });
});

describe("getClaimExplanation - insufficient-evidence restraint", () => {
  it("explicitly states that insufficient evidence does not mean the claim is false", () => {
    const result = getClaimExplanation(input({ assessmentBand: "insufficient_evidence" }));
    expect(result.summary).toContain("does not mean the claim is false");
  });

  it("does not add a redundant uncertainty bullet on top of the insufficient-evidence summary", () => {
    const result = getClaimExplanation(input({ assessmentBand: "insufficient_evidence", confidenceLevel: "very_low" }));
    expect(result.reasons.some((r) => r.type === "uncertainty")).toBe(false);
  });

  it("adds an uncertainty bullet for a low-confidence but non-insufficient band", () => {
    const result = getClaimExplanation(
      input({ assessmentBand: "weakly_supported", independentSupportingCount: 1, confidenceLevel: "low" })
    );
    expect(result.reasons.some((r) => r.type === "uncertainty")).toBe(true);
  });
});

describe("getClaimExplanation - safety: no raw scores, thresholds, or internal jargon", () => {
  const allBands = ["well_supported", "weakly_supported", "contested", "contradicted", "insufficient_evidence"];
  const allConfidence = ["high", "moderate", "low", "very_low"];

  it("never emits a decimal-formatted internal score across the full input space", () => {
    for (const assessmentBand of allBands) {
      for (const confidenceLevel of allConfidence) {
        for (const independentSupportingCount of [0, 1, 2, 5]) {
          for (const directContradictionCount of [0, 1, 3]) {
            for (const weakContradictionCount of [0, 1]) {
              const result = getClaimExplanation({
                assessmentBand,
                confidenceLevel,
                independentSupportingCount,
                directContradictionCount,
                weakContradictionCount,
              });
              const allText = [result.summary, ...result.reasons.map((r) => r.text)].join(" ");
              expect(allText).not.toMatch(/0\.\d\d/); // no raw 0.xx heuristic score
              expect(allText.toLowerCase()).not.toContain("grounding status");
              expect(allText.toLowerCase()).not.toContain("dimension confidence");
              expect(allText.toLowerCase()).not.toContain("threshold");
              expect(allText.toLowerCase()).not.toContain("model version");
            }
          }
        }
      }
    }
  });

  it("falls back to the insufficient-evidence summary for an unrecognized band, never throwing", () => {
    const result = getClaimExplanation(input({ assessmentBand: "some_future_band" }));
    expect(result.summary).toContain("does not mean the claim is false");
  });
});
