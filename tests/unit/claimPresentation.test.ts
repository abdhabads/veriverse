import { describe, it, expect } from "vitest";
import {
  getClaimAssessmentPresentation,
  getClaimSummarySentence,
  getEvidencePublisherLabel,
  toGroundingSource,
  boundEvidenceBuckets,
} from "@/lib/claimPresentation";

describe("getClaimAssessmentPresentation", () => {
  it("maps every known assessmentBand to a distinct label/tone/icon", () => {
    expect(getClaimAssessmentPresentation("well_supported")).toEqual({
      label: "Well Supported",
      tone: "positive",
      icon: "check",
    });
    expect(getClaimAssessmentPresentation("weakly_supported").tone).toBe("review");
    expect(getClaimAssessmentPresentation("contested").tone).toBe("review");
    expect(getClaimAssessmentPresentation("contradicted")).toEqual({
      label: "Contradicted",
      tone: "negative",
      icon: "x",
    });
    expect(getClaimAssessmentPresentation("insufficient_evidence").tone).toBe("neutral");
  });

  it("falls back to insufficient_evidence for an unknown/malformed band rather than throwing", () => {
    expect(getClaimAssessmentPresentation("not_a_real_band")).toEqual(
      getClaimAssessmentPresentation("insufficient_evidence")
    );
  });
});

describe("getClaimSummarySentence", () => {
  it("is deterministic for the same inputs", () => {
    const counts = { supportingCount: 3, contradictingCount: 0, contextCount: 0 };
    expect(getClaimSummarySentence("well_supported", counts)).toBe(
      getClaimSummarySentence("well_supported", counts)
    );
  });

  it("mentions both supporting and contradicting sources when a claim is contested", () => {
    const sentence = getClaimSummarySentence("contested", {
      supportingCount: 2,
      contradictingCount: 1,
      contextCount: 0,
    });
    expect(sentence).toContain("mixed");
    expect(sentence).toContain("2 supporting sources");
    expect(sentence).toContain("1 contradicting source");
  });

  it("never includes a parenthetical count clause when counts are zero", () => {
    const sentence = getClaimSummarySentence("insufficient_evidence", {
      supportingCount: 0,
      contradictingCount: 0,
      contextCount: 0,
    });
    expect(sentence).not.toContain("(");
  });

  it("does not fabricate certainty language for a well-supported claim", () => {
    const sentence = getClaimSummarySentence("well_supported", {
      supportingCount: 1,
      contradictingCount: 0,
      contextCount: 0,
    });
    expect(sentence.toLowerCase()).not.toContain("true");
    expect(sentence.toLowerCase()).not.toContain("proven");
  });
});

describe("getEvidencePublisherLabel", () => {
  it("prefers a non-empty publisher", () => {
    expect(getEvidencePublisherLabel("Reuters", "reuters.com")).toBe("Reuters");
  });

  it("falls back to domain when publisher is empty", () => {
    expect(getEvidencePublisherLabel("", "example.com")).toBe("example.com");
    expect(getEvidencePublisherLabel(undefined, "example.com")).toBe("example.com");
  });

  it("falls back to 'Source' when neither publisher nor domain is usable", () => {
    expect(getEvidencePublisherLabel("", "")).toBe("Source");
    expect(getEvidencePublisherLabel(undefined, undefined)).toBe("Source");
  });

  it("never fabricates a publisher name beyond what was given", () => {
    const label = getEvidencePublisherLabel("  ", "  ");
    expect(label).toBe("Source");
  });
});

describe("toGroundingSource", () => {
  it("maps public evidence fields onto the GroundedEvidencePanel shape", () => {
    const result = toGroundingSource({
      sourceUrl: "https://example.com/a",
      domain: "example.com",
      publisher: "Example News",
      stance: "supports",
      evidenceText: "Officials confirmed it.",
    });
    expect(result).toEqual({
      title: "Example News",
      url: "https://example.com/a",
      domain: "example.com",
      stance: "supports",
      stanceEvidence: "Officials confirmed it.",
    });
  });

  it("never includes internal-only fields such as authorityScore or provider", () => {
    const result = toGroundingSource({
      sourceUrl: "https://example.com/a",
      stance: "unknown",
    });
    expect(result).not.toHaveProperty("authorityScore");
    expect(result).not.toHaveProperty("relevanceScore");
    expect(result).not.toHaveProperty("provider");
    expect(result).not.toHaveProperty("providerRunId");
  });
});

describe("boundEvidenceBuckets", () => {
  it("returns everything unchanged when under the max", () => {
    const buckets = { supporting: [1, 2], contradicting: [3], context: [] };
    expect(boundEvidenceBuckets(buckets, 20)).toEqual(buckets);
  });

  it("caps the total at max without letting one bucket starve the others", () => {
    const buckets = {
      supporting: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      contradicting: [11],
      context: [12],
    };
    const result = boundEvidenceBuckets(buckets, 3);
    const total = result.supporting.length + result.contradicting.length + result.context.length;
    expect(total).toBe(3);
    expect(result.contradicting).toEqual([11]);
    expect(result.context).toEqual([12]);
  });
});
