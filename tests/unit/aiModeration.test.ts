import { describe, expect, it, vi, beforeEach } from "vitest";

const { moderationsCreateMock, responsesCreateMock } = vi.hoisted(() => ({
  moderationsCreateMock: vi.fn(),
  responsesCreateMock: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({
    moderations: { create: moderationsCreateMock },
    responses: { create: responsesCreateMock },
  }),
}));

import { screenContentWithAI } from "@/lib/aiModeration";

function mockModerationResult(flagged = false) {
  moderationsCreateMock.mockResolvedValueOnce({
    results: [{ flagged, categories: {}, category_scores: {} }],
  });
}

function mockClassifierResult(payload: Record<string, unknown>) {
  responsesCreateMock.mockResolvedValueOnce({
    output_text: JSON.stringify(payload),
  });
}

describe("screenContentWithAI", () => {
  beforeEach(() => {
    moderationsCreateMock.mockReset();
    responsesCreateMock.mockReset();
    process.env.OPENAI_TEXT_MODEL = "test-model";
    process.env.AI_ENABLED = "true";
  });

  it("SAFETY: runs safety moderation for an instruction, regardless of contentType", async () => {
    mockModerationResult(true);
    mockClassifierResult({
      baseRiskScore: 60,
      reasons: ["Dangerous instructions"],
      contentType: "instruction",
      extractedClaim: null,
    });

    const result = await screenContentWithAI(
      "Explain step by step how to synthesize chlorine gas at home."
    );

    expect(moderationsCreateMock).toHaveBeenCalledTimes(1);
    expect(result.contentType).toBe("instruction");
    expect(result.extractedClaim).toBeNull();
    // The instruction still carries real risk via reasons/score, independent
    // of contentType/extractedClaim - it is not "safe" just because it has
    // no claim to verify.
    expect(result.aiRiskScore).toBeGreaterThanOrEqual(45);
  });

  it("parses contentType and extractedClaim for a rhetorical_claim", async () => {
    mockModerationResult(false);
    mockClassifierResult({
      baseRiskScore: 70,
      reasons: ["Dangerous medical misinformation framed as a question"],
      contentType: "rhetorical_claim",
      extractedClaim: "bleach cures infections",
    });

    const result = await screenContentWithAI("Isn't it true that bleach cures infections?");

    expect(result.contentType).toBe("rhetorical_claim");
    expect(result.extractedClaim).toBe("bleach cures infections");
  });

  it("classifies a genuine question with no implied claim", async () => {
    mockModerationResult(false);
    mockClassifierResult({
      baseRiskScore: 0,
      reasons: [],
      contentType: "question",
      extractedClaim: null,
    });

    const result = await screenContentWithAI(
      "What's the difference between Narrow AI and General AI?"
    );

    expect(result.contentType).toBe("question");
    expect(result.extractedClaim).toBeNull();
  });

  it("defaults to contentType 'claim' when the classifier omits or garbles the field", async () => {
    mockModerationResult(false);
    mockClassifierResult({
      baseRiskScore: 10,
      reasons: [],
      // no contentType at all
    });

    const result = await screenContentWithAI("Some ordinary post.");

    expect(result.contentType).toBe("claim");
    expect(result.extractedClaim).toBeNull();
  });

  it("never carries an extractedClaim for contentType 'question' even if the model mistakenly includes one", async () => {
    mockModerationResult(false);
    mockClassifierResult({
      baseRiskScore: 0,
      reasons: [],
      contentType: "question",
      extractedClaim: "something the model should not have extracted",
    });

    const result = await screenContentWithAI("What time is it?");

    expect(result.contentType).toBe("question");
    expect(result.extractedClaim).toBeNull();
  });
});
