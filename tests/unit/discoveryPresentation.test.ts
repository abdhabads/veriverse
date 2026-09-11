// tests/unit/discoveryPresentation.test.ts
// P2.7: regression coverage for the exact drift the audit found - a post
// whose raw `status` field still says "verified" but whose canonical
// verdict (contradiction, expert rejection) says otherwise must NOT
// qualify for Evidence Highlights anymore.
import { describe, it, expect } from "vitest";
import { isEvidenceHighlight } from "@/lib/discoveryPresentation";

describe("isEvidenceHighlight", () => {
  it("is true for a well-supported post with no overrides", () => {
    expect(isEvidenceHighlight({ status: "verified", verificationScore: 0.9 })).toBe(true);
  });

  it("is true for an expert-verified post regardless of status/score", () => {
    expect(
      isEvidenceHighlight({ status: "unverified", expertDecision: "verified", verificationScore: 0.1 })
    ).toBe(true);
  });

  it("regression: is false when status is still 'verified' but the post has since been contradicted", () => {
    expect(
      isEvidenceHighlight({ status: "verified", verificationScore: 0.9, contradictionCount: 2 })
    ).toBe(false);
  });

  it("regression: is false when status is still 'verified' but an expert has rejected it", () => {
    expect(
      isEvidenceHighlight({ status: "verified", expertDecision: "false", verificationScore: 0.95 })
    ).toBe(false);
  });

  it("is false for a weak-evidence post even if status happens to say verified", () => {
    expect(isEvidenceHighlight({ status: "verified", verificationScore: 0.2 })).toBe(false);
  });

  it("is false for an unverified (null score) post", () => {
    expect(isEvidenceHighlight({ status: "unverified", verificationScore: null })).toBe(false);
  });

  it("is true for a non-'verified'-status post whose score alone earns a positive verdict", () => {
    expect(isEvidenceHighlight({ status: "unverified", verificationScore: 0.85 })).toBe(true);
  });
});
