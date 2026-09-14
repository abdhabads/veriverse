import { describe, it, expect } from "vitest";
import {
  getClaimAssessmentPresentation,
  getClaimSummarySentence,
  getEvidencePublisherLabel,
  getSourceTypeLabel,
  formatEvidencePublishedDate,
  getIndependenceNotes,
  toGroundingSource,
  boundEvidenceBuckets,
  getClaimUncertainty,
  getUnresolvedEvidenceCaution,
  getClaimTemporalApplicability,
  type ClaimUncertaintyInput,
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
  it("maps public evidence fields onto the GroundedEvidencePanel shape, including the P4.2 additions", () => {
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
      sourceTypeLabel: "Unclassified source",
      publishedAtLabel: null,
      independenceNote: null,
    });
  });

  it("passes through a computed sourceTypeLabel, publishedAtLabel, and independenceNote", () => {
    const result = toGroundingSource(
      {
        sourceUrl: "https://example.com/a",
        domain: "example.com",
        stance: "supports",
        sourceType: "academic",
        publishedAt: "2025-01-15T00:00:00.000Z",
      },
      "Same source domain as another citation"
    );
    expect(result.sourceTypeLabel).toBe("Academic source");
    expect(result.publishedAtLabel).toBe("Jan 15, 2025");
    expect(result.independenceNote).toBe("Same source domain as another citation");
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
    expect(result).not.toHaveProperty("independenceGroup");
  });
});

describe("getSourceTypeLabel", () => {
  it("maps every stored sourceType enum value to a neutral, descriptive label", () => {
    expect(getSourceTypeLabel("government")).toBe("Government source");
    expect(getSourceTypeLabel("academic")).toBe("Academic source");
    expect(getSourceTypeLabel("institutional")).toBe("Institutional source");
    expect(getSourceTypeLabel("journalistic")).toBe("News source");
    expect(getSourceTypeLabel("user_generated")).toBe("User-generated source");
    expect(getSourceTypeLabel("unknown")).toBe("Unclassified source");
  });

  it("falls back to the unknown label for an unrecognized or missing value, never throwing", () => {
    expect(getSourceTypeLabel("some_future_type")).toBe("Unclassified source");
    expect(getSourceTypeLabel(undefined)).toBe("Unclassified source");
    expect(getSourceTypeLabel(null)).toBe("Unclassified source");
  });

  it("never uses trust/credibility/authority-implying wording", () => {
    for (const type of ["government", "academic", "institutional", "journalistic", "user_generated", "unknown"]) {
      const label = getSourceTypeLabel(type).toLowerCase();
      expect(label).not.toContain("trust");
      expect(label).not.toContain("credib");
      expect(label).not.toContain("reliable");
      expect(label).not.toContain("authority");
    }
  });
});

describe("formatEvidencePublishedDate", () => {
  it("formats a valid date as a concise absolute date, never relative wording", () => {
    const label = formatEvidencePublishedDate("2025-01-15T00:00:00.000Z");
    expect(label).toBe("Jan 15, 2025");
    expect(label?.toLowerCase()).not.toContain("ago");
  });

  it("returns null for a missing date rather than fabricating one", () => {
    expect(formatEvidencePublishedDate(null)).toBeNull();
    expect(formatEvidencePublishedDate(undefined)).toBeNull();
  });

  it("returns null for an unparseable date rather than throwing", () => {
    expect(formatEvidencePublishedDate("not-a-real-date")).toBeNull();
  });
});

describe("getIndependenceNotes", () => {
  it("flags items sharing a normalized domain as sharing a source domain, leaving a unique domain unflagged", () => {
    const notes = getIndependenceNotes([
      { domain: "example.com" },
      { domain: "www.example.com" }, // normalizes to the same host
      { domain: "other-example.com" },
    ]);
    expect(notes[0]).toBe("Same source domain as another citation");
    expect(notes[1]).toBe("Same source domain as another citation");
    expect(notes[2]).toBeNull();
  });

  it("never uses full-independence language the domain-only signal cannot prove", () => {
    const notes = getIndependenceNotes([{ domain: "a.com" }, { domain: "a.com" }]);
    for (const note of notes) {
      expect(note?.toLowerCase()).not.toContain("not independent");
      expect(note?.toLowerCase()).not.toContain("independent source");
    }
  });

  it("never flags a domain that appears only once", () => {
    const notes = getIndependenceNotes([{ domain: "a.com" }, { domain: "b.com" }, { domain: "c.com" }]);
    expect(notes).toEqual([null, null, null]);
  });

  it("treats a missing domain as unflaggable rather than grouping empty strings together", () => {
    const notes = getIndependenceNotes([{ domain: "" }, { domain: undefined }, { domain: "" }]);
    expect(notes).toEqual([null, null, null]);
  });

  it("is deterministic for the same input", () => {
    const items = [{ domain: "a.com" }, { domain: "a.com" }, { domain: "b.com" }];
    expect(getIndependenceNotes(items)).toEqual(getIndependenceNotes(items));
  });

  it("never leaks a raw internal independence group identifier", () => {
    const notes = getIndependenceNotes([{ domain: "a.com" }, { domain: "a.com" }]);
    for (const note of notes) {
      expect(note).not.toMatch(/group-\d+/);
    }
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

function uncertaintyInput(overrides: Partial<ClaimUncertaintyInput> = {}): ClaimUncertaintyInput {
  return {
    assessmentBand: "weakly_supported",
    confidenceLevel: "moderate",
    supportingCount: 1,
    contradictingCount: 0,
    contextCount: 0,
    ...overrides,
  };
}

describe("getClaimUncertainty - determinism", () => {
  it("produces identical output for identical input", () => {
    const params = uncertaintyInput({ assessmentBand: "contested", supportingCount: 2, contradictingCount: 1 });
    expect(getClaimUncertainty(params)).toEqual(getClaimUncertainty(params));
  });
});

describe("getClaimUncertainty - insufficient-evidence restraint", () => {
  it("uses a distinct 'may change' forward-looking reason for insufficient_evidence, not a generic confidence bullet", () => {
    const result = getClaimUncertainty(
      uncertaintyInput({ assessmentBand: "insufficient_evidence", confidenceLevel: "very_low" })
    );
    const limited = result.reasons.filter((r) => r.type === "limited_evidence");
    const confidence = result.reasons.filter((r) => r.type === "confidence");
    expect(limited.length).toBe(1);
    expect(confidence.length).toBe(0);
    expect(limited[0].text).toContain("may change");
  });

  it("never implies the claim is false or true", () => {
    const result = getClaimUncertainty(uncertaintyInput({ assessmentBand: "insufficient_evidence" }));
    const allText = [result.level, ...result.reasons.map((r) => r.text)].join(" ").toLowerCase();
    expect(allText).not.toContain("false");
    expect(allText).not.toContain("true");
  });
});

describe("getClaimUncertainty - low-confidence handling", () => {
  it("adds a distinct provisional-caution reason for low/very_low confidence outside insufficient_evidence", () => {
    const low = getClaimUncertainty(uncertaintyInput({ assessmentBand: "weakly_supported", confidenceLevel: "low" }));
    expect(low.reasons.some((r) => r.type === "confidence")).toBe(true);
  });

  it("never emits a confidence caution for high/moderate confidence", () => {
    const high = getClaimUncertainty(uncertaintyInput({ assessmentBand: "well_supported", confidenceLevel: "high" }));
    expect(high.reasons.some((r) => r.type === "confidence")).toBe(false);
  });

  it("is worded distinctly from P4.1's own explanation bullet for the same signal", () => {
    const result = getClaimUncertainty(uncertaintyInput({ confidenceLevel: "low" }));
    const confidenceReason = result.reasons.find((r) => r.type === "confidence");
    expect(confidenceReason?.text).not.toBe("Confidence in this assessment is limited based on the evidence gathered so far.");
  });
});

describe("getClaimUncertainty - contested disagreement", () => {
  it("flags disagreement whenever both buckets are non-empty, independent of the exact assessment band", () => {
    const result = getClaimUncertainty(
      uncertaintyInput({ assessmentBand: "contested", supportingCount: 2, contradictingCount: 1 })
    );
    const disagreement = result.reasons.find((r) => r.type === "disagreement");
    expect(disagreement).toBeDefined();
    expect(disagreement!.text.toLowerCase()).not.toContain("true");
    expect(disagreement!.text.toLowerCase()).not.toContain("false");
  });

  it("never flags disagreement when only one side has evidence", () => {
    const result = getClaimUncertainty(uncertaintyInput({ supportingCount: 3, contradictingCount: 0 }));
    expect(result.reasons.some((r) => r.type === "disagreement")).toBe(false);
  });
});

describe("getClaimUncertainty - unresolved/context evidence", () => {
  it("flags unresolved evidence with the correct singular/plural wording", () => {
    const singular = getClaimUncertainty(uncertaintyInput({ contextCount: 1 }));
    const plural = getClaimUncertainty(uncertaintyInput({ contextCount: 3 }));
    expect(singular.reasons.find((r) => r.type === "unresolved_evidence")!.text).toContain("1 additional source is");
    expect(plural.reasons.find((r) => r.type === "unresolved_evidence")!.text).toContain("3 additional sources are");
  });

  it("omits the unresolved-evidence reason when there is none", () => {
    const result = getClaimUncertainty(uncertaintyInput({ contextCount: 0 }));
    expect(result.reasons.some((r) => r.type === "unresolved_evidence")).toBe(false);
  });
});

describe("getClaimUncertainty - safety: no raw scores, probabilities, or internal jargon", () => {
  const allBands = ["well_supported", "weakly_supported", "contested", "contradicted", "insufficient_evidence"];
  const allConfidence = ["high", "moderate", "low", "very_low"];

  it("never emits a decimal score, percentage, or internal jargon across the input space", () => {
    for (const assessmentBand of allBands) {
      for (const confidenceLevel of allConfidence) {
        for (const supportingCount of [0, 1, 3]) {
          for (const contradictingCount of [0, 1, 2]) {
            for (const contextCount of [0, 1, 4]) {
              const result = getClaimUncertainty({
                assessmentBand,
                confidenceLevel,
                supportingCount,
                contradictingCount,
                contextCount,
              });
              const allText = [result.level, ...result.reasons.map((r) => r.text)].join(" ");
              expect(allText).not.toMatch(/0\.\d\d/);
              expect(allText).not.toMatch(/%/);
              expect(allText.toLowerCase()).not.toContain("probability");
              expect(allText.toLowerCase()).not.toContain("threshold");
              expect(allText.toLowerCase()).not.toContain("grounding status");
              expect(allText.toLowerCase()).not.toContain("independencegroup");
            }
          }
        }
      }
    }
  });

  it("falls back to a safe caution level for an unrecognized confidenceLevel, never throwing", () => {
    const result = getClaimUncertainty(uncertaintyInput({ confidenceLevel: "some_future_level" }));
    expect(typeof result.level).toBe("string");
    expect(result.level.length).toBeGreaterThan(0);
  });
});

describe("getUnresolvedEvidenceCaution", () => {
  it("labels a disqualified contradiction distinctly from genuinely contextual evidence", () => {
    expect(getUnresolvedEvidenceCaution("contradicts")).toContain("possible contradiction");
    expect(getUnresolvedEvidenceCaution("context")).toBeNull();
    expect(getUnresolvedEvidenceCaution("unknown")).toBeNull();
  });

  it("never claims this is a direct/confirmed contradiction", () => {
    const text = getUnresolvedEvidenceCaution("contradicts")!.toLowerCase();
    expect(text).toContain("not strong enough");
  });
});

describe("getClaimTemporalApplicability", () => {
  it("formats a specific month-year scope as a readable month name and year", () => {
    expect(getClaimTemporalApplicability({ type: "specific", value: "2026-09" })).toBe(
      "This assessment applies to September 2026."
    );
  });

  it("formats a specific year-only scope", () => {
    expect(getClaimTemporalApplicability({ type: "specific", value: "2025" })).toBe(
      "This assessment applies to 2025."
    );
  });

  it("describes a relative/current scope without claiming the assessment itself is up to date", () => {
    const text = getClaimTemporalApplicability({ type: "relative", value: "current" });
    expect(text).toBe("This claim concerns an ongoing or current situation rather than a specific past date.");
    expect(text?.toLowerCase()).not.toContain("latest");
    expect(text?.toLowerCase()).not.toContain("up to date");
    expect(text?.toLowerCase()).not.toContain("supersede");
  });

  it("omits temporal copy entirely for an unspecified/timeless scope", () => {
    expect(getClaimTemporalApplicability({ type: "unspecified", value: null })).toBeNull();
  });

  it("omits temporal copy for a missing/absent scope rather than guessing", () => {
    expect(getClaimTemporalApplicability(null)).toBeNull();
    expect(getClaimTemporalApplicability(undefined)).toBeNull();
  });

  it("omits rather than fabricates for a malformed specific value", () => {
    expect(getClaimTemporalApplicability({ type: "specific", value: "not-a-date" })).toBeNull();
    expect(getClaimTemporalApplicability({ type: "specific", value: "2025-13" })).toBeNull();
  });

  it("never claims temporal supersession over a previous assessment", () => {
    const allOutputs = [
      getClaimTemporalApplicability({ type: "specific", value: "2026-09" }),
      getClaimTemporalApplicability({ type: "specific", value: "2025" }),
      getClaimTemporalApplicability({ type: "relative", value: "current" }),
    ].join(" ").toLowerCase();
    expect(allOutputs).not.toContain("replaces the previous");
    expect(allOutputs).not.toContain("supersede");
    expect(allOutputs).not.toContain("latest truth");
  });
});
