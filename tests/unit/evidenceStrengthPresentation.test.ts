// tests/unit/evidenceStrengthPresentation.test.ts
// P2.4: getEvidenceStrength() is the presentation-layer function that
// replaced VerificationBadge's old, independent 0.8/0.6/0.3 threshold
// table. These cases are drawn directly from the P2.4 audit's regression
// scenarios (A-C) - the point of this function is that those scenarios can
// no longer produce a competing "Strong Evidence"-style label next to an
// overridden canonical verdict.
import { describe, it, expect } from "vitest";
import { getTrustVerdict, getEvidenceStrength } from "@/lib/trustPresentation";

describe("getEvidenceStrength", () => {
  it("regression A: hides when the verdict is an expert override, even with a high score", () => {
    const verdict = getTrustVerdict({ status: "verified", expertDecision: "false", verificationScore: 0.95 });
    expect(verdict.label).toBe("Expert Rejected");

    const strength = getEvidenceStrength(verdict, 0.95);
    expect(strength.visible).toBe(false);
  });

  it("regression B: hides when the verdict is a contradiction override, even with a high score", () => {
    const verdict = getTrustVerdict({ status: "unverified", contradictionCount: 2, verificationScore: 0.9 });
    expect(verdict.label).toBe("Contradicted");

    const strength = getEvidenceStrength(verdict, 0.9);
    expect(strength.visible).toBe(false);
  });

  it("regression C: uses the same 0.8/0.6 bands as the canonical verdict for a pure-evidence mid score, never a third threshold", () => {
    const verdict = getTrustVerdict({ status: "unverified", verificationScore: 0.45 });
    expect(verdict.label).toBe("Weak Evidence");
    expect(verdict.tone).toBe("negative");

    const strength = getEvidenceStrength(verdict, 0.45);
    expect(strength.visible).toBe(true);
    if (strength.visible) {
      expect(strength.label).toBe("Limited");
      expect(strength.tone).toBe("negative");
    }
  });

  it("hides for review-state verdicts (under_expert_review), not just expert/contradiction overrides", () => {
    const verdict = getTrustVerdict({ status: "under_expert_review", verificationScore: 0.9 });
    const strength = getEvidenceStrength(verdict, 0.9);
    expect(strength.visible).toBe(false);
  });

  it("hides for flagged verdicts", () => {
    const verdict = getTrustVerdict({ status: "flagged", verificationScore: 0.9 });
    const strength = getEvidenceStrength(verdict, 0.9);
    expect(strength.visible).toBe(false);
  });

  it("hides for Not a Claim verdicts", () => {
    const verdict = getTrustVerdict({ status: "unverified", contentType: "question", verificationScore: 0.9 });
    const strength = getEvidenceStrength(verdict, 0.9);
    expect(strength.visible).toBe(false);
  });

  it("hides when score is null even for a pure-evidence tier (Unverified already says so)", () => {
    const verdict = getTrustVerdict({ status: "unverified", verificationScore: null });
    const strength = getEvidenceStrength(verdict, null);
    expect(strength.visible).toBe(false);
  });

  it("shows Strong for a pure-evidence verdict with score >= 0.8", () => {
    const verdict = getTrustVerdict({ status: "unverified", verificationScore: 0.85 });
    expect(verdict.label).toBe("Well Supported");

    const strength = getEvidenceStrength(verdict, 0.85);
    expect(strength.visible).toBe(true);
    if (strength.visible) {
      expect(strength.label).toBe("Strong");
      expect(strength.tone).toBe("positive");
    }
  });

  it("shows Moderate for a pure-evidence verdict with 0.6 <= score < 0.8", () => {
    const verdict = getTrustVerdict({ status: "unverified", verificationScore: 0.65 });
    expect(verdict.label).toBe("Supported");

    const strength = getEvidenceStrength(verdict, 0.65);
    expect(strength.visible).toBe(true);
    if (strength.visible) {
      expect(strength.label).toBe("Moderate");
      expect(strength.tone).toBe("positive");
    }
  });
});
