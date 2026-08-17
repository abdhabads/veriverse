// tests/unit/contradictionForcing.test.ts
import { describe, it, expect } from "vitest";
import { evaluateContradictionForcing } from "@/lib/contradictionForcing";

describe("evaluateContradictionForcing", () => {

  describe("does not force when already in a strong state", () => {
    it("skips flagged posts", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 3,
        groundingConfidence: 0.95,
        currentStatus: "flagged",
      });
      expect(result.forced).toBe(false);
    });

    it("skips posts under expert review", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 3,
        groundingConfidence: 0.95,
        currentStatus: "under_expert_review",
      });
      expect(result.forced).toBe(false);
    });

    it("skips posts under appeal review", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 2,
        groundingConfidence: 0.9,
        currentStatus: "under_appeal_review",
      });
      expect(result.forced).toBe(false);
    });
  });

  describe("forces flagged on strong contradiction evidence", () => {
    it("forces when contradictionCount >= 2 and confidence >= 0.7", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 2,
        groundingConfidence: 0.7,
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(true);
      if (result.forced) {
        expect(result.targetStatus).toBe("flagged");
        expect(result.reason).toMatch(/contradiction forcing/i);
      }
    });

    it("forces when contradictionCount >= 3 and confidence >= 0.7", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 3,
        groundingConfidence: 0.8,
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(true);
    });

    it("forces on single contradiction at confidence >= 0.85", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 1,
        groundingConfidence: 0.85,
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(true);
      if (result.forced) {
        expect(result.targetStatus).toBe("flagged");
      }
    });

    it("forces from unverified status", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 2,
        groundingConfidence: 0.75,
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(true);
    });
  });

  describe("does not force on weak contradiction signals", () => {
    it("does not force when contradictionCount is 0", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 0,
        groundingConfidence: 0.95,
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(false);
    });

    it("does not force when confidence is below threshold with 2 contradictions", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 2,
        groundingConfidence: 0.65, // just below 0.7
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(false);
    });

    it("does not force on single contradiction below 0.85 confidence", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 1,
        groundingConfidence: 0.8, // below 0.85
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(false);
    });

    it("does not force at exactly the boundary for single contradiction", () => {
      const result = evaluateContradictionForcing({
        contradictionCount: 1,
        groundingConfidence: 0.84,
        currentStatus: "unverified",
      });
      expect(result.forced).toBe(false);
    });
  });
});
