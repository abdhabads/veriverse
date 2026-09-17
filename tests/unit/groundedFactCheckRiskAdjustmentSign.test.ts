// tests/unit/groundedFactCheckRiskAdjustmentSign.test.ts
//
// Regression coverage for the evidenceRiskAdjustment sign-consistency guard
// added to lib/groundedFactCheck.ts. The prompt itself instructs a NEGATIVE
// adjustment when evidence supports the claim - the model can still return
// a positive value despite unanimous "supports" stances (observed directly:
// claim "Vaccines do not cause autism", 3/3 supports, evidenceRiskAdjustment
// +15). This guard clamps ONLY that specific, provably-inconsistent case.
// Mocking pattern matches the existing tests/unit/groundedFactCheck.test.ts
// exactly (not edited here - that file is left untouched).
import { describe, expect, it, vi, beforeEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({ responses: { create: createMock } }),
}));
vi.mock("@/lib/logger", () => ({ logEvent: vi.fn() }));

import { runGroundedFactCheck } from "@/lib/groundedFactCheck";

function mockTwoCalls(researchText: string, formatted: Record<string, unknown>) {
  createMock
    .mockResolvedValueOnce({ output_text: researchText })
    .mockResolvedValueOnce({ output_text: JSON.stringify(formatted) });
}

describe("evidenceRiskAdjustment sign-consistency guard", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_TEXT_MODEL = "test-model";
  });

  it("DEFECT (now fixed): unanimous supports with a positive model-returned adjustment is clamped to <= 0", async () => {
    mockTwoCalls("Research confirms vaccines do not cause autism.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence supports the claim.",
      groundingSources: [
        { title: "WHO", url: "https://who.int/a", stance: "supports", stanceEvidence: null },
        { title: "CDC", url: "https://cdc.gov/b", stance: "supports", stanceEvidence: null },
      ],
      evidenceRiskAdjustment: 15, // internally inconsistent with the prompt's own rule
    });

    const result = await runGroundedFactCheck("Vaccines do not cause autism.");
    expect(result.evidenceRiskAdjustment).toBeLessThanOrEqual(0);
  });

  it("unanimous supports with an already-negative adjustment is left unchanged", async () => {
    mockTwoCalls("Research supports the claim.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence supports the claim.",
      groundingSources: [
        { title: "CDC", url: "https://cdc.gov/a", stance: "supports", stanceEvidence: null },
      ],
      evidenceRiskAdjustment: -15,
    });

    const result = await runGroundedFactCheck("Seatbelts reduce injury risk.");
    expect(result.evidenceRiskAdjustment).toBe(-15);
  });

  it("CONTROL: mixed supports/contradicts with a positive adjustment is NOT clamped - contradictory evidence is never suppressed", async () => {
    mockTwoCalls("Research is mixed.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence is mixed.",
      groundingSources: [
        { title: "Source A", url: "https://a.example/1", stance: "supports", stanceEvidence: null },
        { title: "Source B", url: "https://b.example/1", stance: "contradicts", stanceEvidence: null },
      ],
      evidenceRiskAdjustment: 15,
    });

    const result = await runGroundedFactCheck("Some contested claim.");
    expect(result.evidenceRiskAdjustment).toBe(15); // untouched - this is the case the guard must NOT alter
  });

  it("CONTROL: unanimous contradicts with a positive adjustment is NOT touched by this guard (unrelated scoring unchanged)", async () => {
    mockTwoCalls("Research contradicts the claim.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence contradicts the claim.",
      groundingSources: [
        { title: "Source A", url: "https://a.example/1", stance: "contradicts", stanceEvidence: null },
      ],
      evidenceRiskAdjustment: 15,
    });

    const result = await runGroundedFactCheck("A false claim.");
    expect(result.evidenceRiskAdjustment).toBe(15);
  });
});
