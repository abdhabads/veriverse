import { describe, it, expect } from "vitest";
import { getEvidenceSummary } from "@/components/GroundedEvidencePanel";

describe("getEvidenceSummary", () => {
  it("prefers the evidence-assessment explanation when present", () => {
    const summary = getEvidenceSummary(
      "checked",
      "An older, cruder grounding summary.",
      2,
      "Moderate support: 2 independent sources support the claim."
    );
    expect(summary).toBe("Moderate support: 2 independent sources support the claim.");
  });

  it("falls back to groundingSummary when explanation is absent", () => {
    const summary = getEvidenceSummary("checked", "A grounding summary.", 2, undefined);
    expect(summary).toBe("A grounding summary.");
  });

  it("falls back to groundingSummary when explanation is an empty string", () => {
    const summary = getEvidenceSummary("checked", "A grounding summary.", 2, "   ");
    expect(summary).toBe("A grounding summary.");
  });

  it("falls back to the insufficient-evidence message when both are absent", () => {
    const summary = getEvidenceSummary("insufficient_evidence", undefined, 0, undefined);
    expect(summary).toBe(
      "Available evidence is still too thin or conflicting for a confident conclusion."
    );
  });

  it("falls back to a generic source-collected message when sources exist but no summary/explanation", () => {
    const summary = getEvidenceSummary("checked", undefined, 3, undefined);
    expect(summary).toBe("Supporting source context has been collected for this claim.");
  });

  it("renders cleanly for legacy posts with no evidence data at all", () => {
    const summary = getEvidenceSummary(undefined, undefined, 0, undefined);
    expect(summary).toBe("No evidence has been attached yet.");
  });

  it("does not reference internal pipeline terminology", () => {
    const summary = getEvidenceSummary(undefined, undefined, 0, undefined);
    expect(summary.toLowerCase()).not.toContain("grounding");
    expect(summary.toLowerCase()).not.toContain("pipeline");
  });
});
