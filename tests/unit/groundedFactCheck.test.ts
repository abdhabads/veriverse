import { describe, expect, it, vi, beforeEach } from "vitest";

const { createMock, logEventMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  logEventMock: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({
    responses: { create: createMock },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logEvent: logEventMock,
}));

import { runGroundedFactCheck } from "@/lib/groundedFactCheck";

describe("runGroundedFactCheck stanceEvidence verification", () => {
  beforeEach(() => {
    createMock.mockReset();
    logEventMock.mockReset();
    process.env.OPENAI_TEXT_MODEL = "test-model";
  });

  it("nulls out stanceEvidence and logs when the model's quote isn't in the research text", async () => {
    const researchText =
      "According to the CDC, vaccines are safe and effective for most people.";

    const formattedJson = JSON.stringify({
      groundingStatus: "checked",
      groundingSummary: "Evidence contradicts the claim.",
      groundingSources: [
        {
          title: "CDC Vaccine Safety",
          url: "https://cdc.gov/vaccines",
          stance: "contradicts",
          // Not present anywhere in researchText above - a paraphrase/fabrication.
          stanceEvidence: "This vaccine has been proven completely unsafe for everyone",
        },
      ],
      evidenceRiskAdjustment: 15,
    });

    createMock
      .mockResolvedValueOnce({ output_text: researchText })
      .mockResolvedValueOnce({ output_text: formattedJson });

    const result = await runGroundedFactCheck("Vaccines are dangerous");

    expect(result.groundingSources).toHaveLength(1);
    expect(result.groundingSources[0].stanceEvidence).toBeNull();
    expect(logEventMock).toHaveBeenCalledWith(
      "GROUNDING_STANCE_EVIDENCE_UNVERIFIED",
      expect.objectContaining({
        url: "https://cdc.gov/vaccines",
        stance: "contradicts",
        claimedEvidence: "This vaccine has been proven completely unsafe for everyone",
      })
    );
  });

  it("keeps stanceEvidence when the quote (normalized for whitespace/smart quotes) is present in the research text", async () => {
    const researchText =
      'The CDC states: “Vaccines are safe   and effective” in its latest report.';

    const formattedJson = JSON.stringify({
      groundingStatus: "checked",
      groundingSummary: "Evidence supports the claim.",
      groundingSources: [
        {
          title: "CDC Vaccine Safety",
          url: "https://cdc.gov/vaccines",
          stance: "supports",
          stanceEvidence: '"Vaccines are safe and effective"',
        },
      ],
      evidenceRiskAdjustment: -10,
    });

    createMock
      .mockResolvedValueOnce({ output_text: researchText })
      .mockResolvedValueOnce({ output_text: formattedJson });

    const result = await runGroundedFactCheck("Vaccines are safe");

    expect(result.groundingSources[0].stanceEvidence).toBe(
      '"Vaccines are safe and effective"'
    );
    expect(logEventMock).not.toHaveBeenCalled();
  });
});
