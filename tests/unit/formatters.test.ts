import { describe, expect, it } from "vitest";
import { formatVerificationScore } from "@/lib/formatters";

describe("formatVerificationScore", () => {
  it("converts a 0-1 float to a rounded percentage", () => {
    expect(formatVerificationScore(0.7)).toBe("70%");
    expect(formatVerificationScore(0.85)).toBe("85%");
  });

  it("handles the boundary values", () => {
    expect(formatVerificationScore(0)).toBe("0%");
    expect(formatVerificationScore(1)).toBe("100%");
  });

  it("does not crash on posts that haven't finished evaluating yet", () => {
    expect(formatVerificationScore(null)).toBe("—");
    expect(formatVerificationScore(undefined)).toBe("—");
  });
});
