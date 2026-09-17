// tests/unit/groundedFactCheckAttributionInstruction.test.ts
//
// Regression coverage for the prompt-level instruction added to
// FORMAT_SYSTEM_PROMPT in lib/groundedFactCheck.ts, distinguishing evidence
// about the underlying factual proposition from evidence that a source
// merely reports an institution/person having said/published/changed/
// disputed/endorsed/described a claim.
//
// WHAT THESE TESTS PROVE: (1) the instruction text is actually part of the
// system prompt sent to the model, not just a comment no one reads - and
// (2) IF the model returns a response that follows the instruction, the
// existing code passes that stance through unmodified, with no
// post-processing step that could override or undo it.
//
// WHAT THESE TESTS CANNOT PROVE: whether the real OpenAI model, given this
// instruction, will actually classify the AP-style example (or any other
// real case) as "context" rather than "supports"/"contradicts". That is a
// live-model behavior question. Every mocked response below is authored by
// this test file to simulate a compliant answer - it is not evidence the
// model will produce that answer. Verifying real compliance requires an
// actual OpenAI call, out of scope for this offline check.
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

describe("FORMAT_SYSTEM_PROMPT actually transmits the attribution/meta-reporting instruction", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_TEXT_MODEL = "test-model";
  });

  it("the system prompt sent on the formatting call contains the instruction and the CDC/vaccines example", async () => {
    mockTwoCalls("Some research text.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence is unclear.",
      groundingSources: [],
      evidenceRiskAdjustment: 0,
    });

    await runGroundedFactCheck("Some claim.");

    // Verifies the instruction is actually part of what gets sent to the
    // model on the second (formatting) call - not merely present as a
    // comment in this codebase that nothing transmits.
    expect(createMock).toHaveBeenCalledTimes(2);
    const secondCallArgs = createMock.mock.calls[1][0];
    const systemMessage = secondCallArgs.input.find((m: any) => m.role === "system")?.content;

    expect(systemMessage).toContain("Vaccines cause autism");
    expect(systemMessage).toContain("CDC");
    expect(systemMessage).toContain("underlying factual proposition");
    expect(systemMessage).toMatch(/said|published|changed|removed|disputed|endorsed|described/);
    expect(systemMessage).toMatch(
      /a source quoting an institution saying a\s+claim is false is not automatically substantive/
    );
  });
});

describe("compliant model responses pass through unmodified (does not prove live-model compliance)", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_TEXT_MODEL = "test-model";
  });

  it("AP-style CDC website-change report, classified 'context' by the (simulated) model, is returned as 'context'", async () => {
    mockTwoCalls("Research text about a CDC website change.", {
      groundingStatus: "checked",
      groundingSummary: "The scientific consensus contradicts the claim; a reported CDC website change is separate context.",
      groundingSources: [
        {
          title: "CDC website changed to contradict scientific conclusion that vaccines don't cause autism",
          url: "https://apnews.com/article/example",
          // Simulated compliant response - the model itself decides this,
          // this test only asserts the code doesn't undo it.
          stance: "context",
          stanceEvidence: null,
        },
      ],
      evidenceRiskAdjustment: 5,
    });

    const result = await runGroundedFactCheck("Vaccines cause autism.");
    expect(result.groundingSources[0].stance).toBe("context");
  });

  it("CONTROL: a source presenting direct, substantive supporting evidence remains 'supports'", async () => {
    mockTwoCalls("Research text with direct supporting data.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence supports the claim.",
      groundingSources: [
        {
          title: "NHTSA seat belt effectiveness data",
          url: "https://nhtsa.gov/example",
          stance: "supports",
          stanceEvidence: "Seat belts reduce the risk of fatal injury by 45%.",
        },
      ],
      evidenceRiskAdjustment: -15,
    });

    const result = await runGroundedFactCheck("Seatbelts reduce the risk of serious injury.");
    expect(result.groundingSources[0].stance).toBe("supports");
  });

  it("CONTROL: a source presenting direct, substantive contradicting evidence remains 'contradicts'", async () => {
    mockTwoCalls("Research text with direct contradicting findings.", {
      groundingStatus: "checked",
      groundingSummary: "Evidence contradicts the claim.",
      groundingSources: [
        {
          title: "WHO analysis on vaccines and autism",
          url: "https://who.int/example",
          stance: "contradicts",
          stanceEvidence: "The findings reaffirmed that there is no causal link between vaccines and autism spectrum disorder.",
        },
      ],
      evidenceRiskAdjustment: 15,
    });

    const result = await runGroundedFactCheck("Vaccines cause autism.");
    expect(result.groundingSources[0].stance).toBe("contradicts");
  });

  it("INVERSE case: an institution merely quoted as calling the claim false, with no underlying evidence, classified 'context' by the (simulated) model, is returned as 'context'", async () => {
    mockTwoCalls("Research text with an unsubstantiated denial.", {
      groundingStatus: "insufficient_evidence",
      groundingSummary: "An official denied the claim, but no underlying evidence was cited.",
      groundingSources: [
        {
          title: "Official statement denies claim",
          url: "https://example.gov/statement",
          // Simulated compliant response: a bare denial with no
          // substantiating data, per the inverse principle in the prompt.
          stance: "context",
          stanceEvidence: null,
        },
      ],
      evidenceRiskAdjustment: 0,
    });

    const result = await runGroundedFactCheck("Some contested claim.");
    expect(result.groundingSources[0].stance).toBe("context");
  });
});
