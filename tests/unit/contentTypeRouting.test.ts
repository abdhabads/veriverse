import { describe, it, expect } from "vitest";
import { resolveGroundingPlan } from "@/lib/contentTypeRouting";

describe("resolveGroundingPlan", () => {
  it("evaluates a normal claim on its original text", () => {
    const plan = resolveGroundingPlan({
      content: "Vaccines cause autism.",
      contentType: "claim",
      extractedClaim: null,
    });
    expect(plan.skipGrounding).toBe(false);
    expect(plan.groundingQuery).toBe("Vaccines cause autism.");
  });

  it("evaluates a declarative claim with question-shaped syntax normally", () => {
    // "What caused X was Y" is a claim, not a question, even though it
    // starts with a wh-word - the classifier is trusted over surface syntax.
    const content = "What caused the 2008 crash was subprime lending.";
    const plan = resolveGroundingPlan({
      content,
      contentType: "claim",
      extractedClaim: null,
    });
    expect(plan.skipGrounding).toBe(false);
    expect(plan.groundingQuery).toBe(content);
  });

  it("skips grounding for a genuine question with no implied claim", () => {
    const plan = resolveGroundingPlan({
      content: "What's the difference between Narrow AI and General AI?",
      contentType: "question",
      extractedClaim: null,
    });
    expect(plan.skipGrounding).toBe(true);
  });

  it("skips grounding for an instruction with no implied claim", () => {
    const plan = resolveGroundingPlan({
      content: "Provide two real-world examples of Narrow AI.",
      contentType: "instruction",
      extractedClaim: null,
    });
    expect(plan.skipGrounding).toBe(true);
  });

  it("NO BYPASS: a rhetorical question carrying a dangerous implied claim is fully evaluated on that claim, not soft-gated", () => {
    const plan = resolveGroundingPlan({
      content: "Isn't it true that bleach cures infections?",
      contentType: "rhetorical_claim",
      extractedClaim: "bleach cures infections",
    });
    expect(plan.skipGrounding).toBe(false);
    expect(plan.groundingQuery).toBe("bleach cures infections");
  });

  it("fails toward full evaluation if classified rhetorical_claim but no assertion was extracted", () => {
    const content = "Isn't it obviously true?";
    const plan = resolveGroundingPlan({
      content,
      contentType: "rhetorical_claim",
      extractedClaim: null,
    });
    expect(plan.skipGrounding).toBe(false);
    expect(plan.groundingQuery).toBe(content);
  });
});
