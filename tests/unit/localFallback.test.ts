import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock environment to force fallback
beforeAll(() => {
  vi.stubEnv("AI_ENABLED", "false");
});

// We test via screenContentWithAI which calls localFallback when AI disabled
// Import after env stub
import { screenContentWithAI } from "@/lib/aiModeration";

describe("localFallback - medical misinformation", () => {
  it("catches 'miraculously cures sickle cell anemia'", async () => {
    const result = await screenContentWithAI(
      "eating five dates daily miraculously cures sickle cell anemia"
    );
    expect(result.provider).toBe("fallback");
    expect(result.aiRiskScore).toBeGreaterThan(19);
    expect(result.aiLabel).not.toBe("safe");
  });

  it("catches miracle cure pattern", async () => {
    const result = await screenContentWithAI(
      "This miracle cure eliminates cancer in 3 days"
    );
    expect(result.aiRiskScore).toBeGreaterThan(44);
  });

  it("catches guaranteed cure claim", async () => {
    const result = await screenContentWithAI(
      "This treatment is 100% guaranteed to cure diabetes"
    );
    expect(result.aiRiskScore).toBeGreaterThan(44);
  });

  it("does not flag neutral health content", async () => {
    const result = await screenContentWithAI(
      "Eating vegetables daily is good for your health"
    );
    expect(result.aiRiskScore).toBeLessThan(20);
    expect(result.aiLabel).toBe("safe");
  });
});

describe("localFallback - false equivalence", () => {
  it("catches camels and speedboats same speed", async () => {
    const result = await screenContentWithAI(
      "camels and speed boats have the same speed"
    );
    expect(result.provider).toBe("fallback");
    expect(result.aiRiskScore).toBeGreaterThan(19);
  });
});

describe("localFallback - conspiracy framing", () => {
  it("catches chemtrails claim", async () => {
    const result = await screenContentWithAI(
      "chemtrails are being used to control the population"
    );
    expect(result.aiRiskScore).toBeGreaterThan(19);
  });

  it("catches election fraud claim", async () => {
    const result = await screenContentWithAI(
      "the election was stolen through rigged voting machines"
    );
    // Election misinformation scores 30 (suspicious) - correctly flagged
    expect(result.aiRiskScore).toBeGreaterThan(19);
    expect(result.aiLabel).not.toBe("safe");
  });
});

describe("localFallback - safe content", () => {
  it("does not flag opinion content", async () => {
    const result = await screenContentWithAI(
      "I think the new park design looks great"
    );
    expect(result.aiRiskScore).toBeLessThan(20);
  });

  it("does not flag factual news", async () => {
    const result = await screenContentWithAI(
      "The council approved the budget for road repairs yesterday"
    );
    expect(result.aiRiskScore).toBeLessThan(20);
  });
});
