import { describe, expect, it } from "vitest";
import { classifyStance } from "@/lib/tavilyGrounding";

describe("classifyStance", () => {
  it("still classifies clinical claims via the medical vocabulary", () => {
    const stance = classifyStance(
      "Raw honey on wounds: no clinical evidence, not recommended by guidelines",
      "Raw honey heals diabetic foot ulcers faster than standard dressings"
    );
    expect(stance).toBe("contradicts");
  });

  it("falls back to topic overlap for a true non-medical factual claim", () => {
    const stance = classifyStance(
      "Bola Tinubu | Biography, Wife, Chicago, & Facts. Bola Tinubu is a Nigerian politician who has served as President of Nigeria since May 2023.",
      "Tinubu is the current president of Nigeria"
    );
    expect(stance).toBe("supports");
  });

  it("does not misclassify an unrelated source as supporting", () => {
    const stance = classifyStance(
      "Weather forecast for Lagos this week: mostly sunny with light rain on Thursday.",
      "Tinubu is the current president of Nigeria"
    );
    expect(stance).toBe("unknown");
  });

  it("flags a strong falsity signal on an on-topic source as a contradiction", () => {
    const stance = classifyStance(
      "Fact check: it is false that Tinubu is the president of Nigeria",
      "Tinubu is the current president of Nigeria"
    );
    expect(stance).toBe("contradicts");
  });
});
