// tests/unit/trustVerdict.test.ts
import { describe, it, expect } from "vitest";
import { getTrustVerdict } from "@/lib/trustPresentation";

describe("getTrustVerdict", () => {

  describe("expert decisions take priority", () => {
    it("returns Expert Verified for expertDecision verified", () => {
      const v = getTrustVerdict({ status: "unverified", expertDecision: "verified" });
      expect(v.label).toBe("Expert Verified");
      expect(v.priority).toBe(100);
    });

    it("returns Expert Rejected for expertDecision false", () => {
      const v = getTrustVerdict({ status: "unverified", expertDecision: "false" });
      expect(v.label).toBe("Expert Rejected");
      expect(v.priority).toBe(100);
    });

    it("returns Expert Disputed for expertDecision disputed", () => {
      const v = getTrustVerdict({ status: "unverified", expertDecision: "disputed" });
      expect(v.label).toBe("Expert Disputed");
      expect(v.priority).toBe(100);
    });

    it("expert decision overrides high verification score", () => {
      const v = getTrustVerdict({
        status: "verified",
        expertDecision: "false",
        verificationScore: 0.95,
      });
      expect(v.label).toBe("Expert Rejected");
    });
  });

  describe("review states", () => {
    it("returns Under Expert Review for under_expert_review status", () => {
      const v = getTrustVerdict({ status: "under_expert_review" });
      expect(v.label).toBe("Under Expert Review");
      expect(v.priority).toBe(80);
    });

    it("returns Under Appeal for under_appeal_review status", () => {
      const v = getTrustVerdict({ status: "under_appeal_review" });
      expect(v.label).toBe("Under Appeal");
      expect(v.priority).toBe(75);
    });
  });

  describe("contradiction evidence", () => {
    it("returns Contradicted when contradictionCount > 0", () => {
      const v = getTrustVerdict({
        status: "unverified",
        contradictionCount: 1,
        verificationScore: 0.9,
      });
      expect(v.label).toBe("Contradicted");
      expect(v.priority).toBe(70);
    });

    it("returns Contradicted when a source has contradicts stance", () => {
      const v = getTrustVerdict({
        status: "unverified",
        groundingSources: [{ stance: "contradicts" }],
      });
      expect(v.label).toBe("Contradicted");
    });

    it("contradiction overrides high verification score", () => {
      const v = getTrustVerdict({
        status: "unverified",
        contradictionCount: 2,
        verificationScore: 0.85,
      });
      expect(v.label).toBe("Contradicted");
    });
  });

  describe("flagged status", () => {
    it("returns Flagged for flagged status with no contradiction", () => {
      const v = getTrustVerdict({ status: "flagged" });
      expect(v.label).toBe("Flagged");
      expect(v.priority).toBe(60);
    });
  });

  describe("evidence-based verdicts", () => {
    it("returns Well Supported for score >= 0.8", () => {
      const v = getTrustVerdict({ status: "unverified", verificationScore: 0.8 });
      expect(v.label).toBe("Well Supported");
    });

    it("returns Well Supported for score = 1.0", () => {
      const v = getTrustVerdict({ status: "unverified", verificationScore: 1.0 });
      expect(v.label).toBe("Well Supported");
    });

    it("returns Supported for score >= 0.6 and < 0.8", () => {
      const v = getTrustVerdict({ status: "unverified", verificationScore: 0.65 });
      expect(v.label).toBe("Supported");
    });

    it("returns Weak Evidence for score > 0 and < 0.3", () => {
      const v = getTrustVerdict({ status: "unverified", verificationScore: 0.2 });
      expect(v.label).toBe("Weak Evidence");
    });

    it("returns Unverified for null score", () => {
      const v = getTrustVerdict({ status: "unverified", verificationScore: null });
      expect(v.label).toBe("Unverified");
    });
  });

  describe("default unverified", () => {
    it("returns Unverified when no signals present", () => {
      const v = getTrustVerdict({ status: "unverified" });
      expect(v.label).toBe("Unverified");
      expect(v.priority).toBe(0);
    });
  });

  describe("non-claim content", () => {
    it("returns Not a Claim for a genuine question, even with a nonzero score on record", () => {
      // A skipped-grounding post still carries a structural-default score
      // (grounding never ran) - it must never render as an evidence tier.
      const v = getTrustVerdict({
        status: "unverified",
        contentType: "question",
        verificationScore: 0.2,
      });
      expect(v.label).toBe("Not a Claim");
      expect(v.tone).toBe("neutral");
      expect(v.detail).toBeTruthy();
    });

    it("returns Not a Claim for an instruction", () => {
      const v = getTrustVerdict({
        status: "unverified",
        contentType: "instruction",
        verificationScore: 0.2,
      });
      expect(v.label).toBe("Not a Claim");
    });

    it("still evaluates a rhetorical_claim on its extracted assertion like any other claim", () => {
      // rhetorical_claim is NOT a non-claim content type - it must fall
      // through to ordinary evidence-based verdicts, proving the "no
      // verdict" gate never applies to something with an actual assertion.
      const v = getTrustVerdict({
        status: "unverified",
        contentType: "rhetorical_claim",
        verificationScore: 0.85,
      });
      expect(v.label).toBe("Well Supported");
    });

    it("flagged status still takes priority over a question's contentType", () => {
      const v = getTrustVerdict({
        status: "flagged",
        contentType: "question",
      });
      expect(v.label).toBe("Flagged");
    });

    it("contradiction evidence still takes priority over a question's contentType", () => {
      const v = getTrustVerdict({
        status: "unverified",
        contentType: "question",
        contradictionCount: 1,
      });
      expect(v.label).toBe("Contradicted");
    });
  });
});
