import { describe, it, expect } from "vitest";
import { requiresExpertReview } from "@/lib/expertReview";

describe("expert review routing", () => {
  it("routes sensitive keywords", () => {
    expect(
      requiresExpertReview("This new treatment is amazing", ["health"], 20)
    ).toBe(true);
  });

  it("routes high risk score", () => {
    expect(
      requiresExpertReview("Normal content", [], 50)
    ).toBe(true);
  });

  it("does not route low-risk general content", () => {
    expect(
      requiresExpertReview("The event starts tomorrow", [], 5)
    ).toBe(false);
  });
});
