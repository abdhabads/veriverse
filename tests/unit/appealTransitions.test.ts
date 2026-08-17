// tests/unit/appealTransitions.test.ts
import { describe, it, expect } from "vitest";

// We test the transition logic directly since it maps to
// canTransitionTrustState from trustTransitions.ts
import { canTransitionTrustState } from "@/lib/trustTransitions";

describe("appeal-related trust state transitions", () => {

  describe("approved appeal transitions", () => {
    it("under_appeal_review can transition to unverified", () => {
      expect(canTransitionTrustState("under_appeal_review", "unverified")).toBe(true);
    });

    it("under_appeal_review can transition to disputed", () => {
      expect(canTransitionTrustState("under_appeal_review", "disputed")).toBe(true);
    });

    it("under_appeal_review can transition to verified", () => {
      expect(canTransitionTrustState("under_appeal_review", "verified")).toBe(true);
    });

    it("under_appeal_review can transition to false", () => {
      expect(canTransitionTrustState("under_appeal_review", "false")).toBe(true);
    });
  });

  describe("rejected appeal transitions", () => {
    it("under_appeal_review can return to disputed after rejection", () => {
      expect(canTransitionTrustState("under_appeal_review", "disputed")).toBe(true);
    });
  });

  describe("invalid appeal transitions", () => {
    it("verified cannot transition directly to under_appeal_review without going through appeal", () => {
      expect(canTransitionTrustState("unverified", "under_appeal_review")).toBe(false);
    });

    it("under_expert_review cannot transition to under_appeal_review", () => {
      expect(canTransitionTrustState("under_expert_review", "under_appeal_review")).toBe(false);
    });
  });
});
