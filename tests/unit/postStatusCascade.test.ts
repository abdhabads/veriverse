import { describe, it, expect } from "vitest";
import { determinePostStatus } from "@/lib/postStatusCascade";

const base = {
  aiLabel: "suspicious" as const,
  contradictionCount: 0,
  groundingConfidence: 100,
  groundingStatus: "checked" as const,
  verificationScore: 0.84,
  needsExpertReview: false,
};

describe("determinePostStatus - evidence de-escalation override", () => {
  it("de-escalates suspicious + strong evidence + 0 contradictions + confident grounding to unverified", () => {
    const result = determinePostStatus(base);
    expect(result.status).toBe("unverified");
    expect(result.evidenceDeescalationApplied).toBe(true);
    expect(result.contradictionForcingApplied).toBe(false);
  });

  it("still flags suspicious + strong evidence with a single contradiction", () => {
    const result = determinePostStatus({
      ...base,
      contradictionCount: 1,
    });
    expect(result.status).toBe("flagged");
    expect(result.evidenceDeescalationApplied).toBe(false);
  });

  it("still flags suspicious when grounding confidence is below 60", () => {
    const result = determinePostStatus({
      ...base,
      groundingConfidence: 59,
    });
    expect(result.status).toBe("flagged");
    expect(result.evidenceDeescalationApplied).toBe(false);
  });

  it("still flags suspicious when groundingStatus is insufficient_evidence", () => {
    const result = determinePostStatus({
      ...base,
      groundingStatus: "insufficient_evidence",
    });
    expect(result.status).toBe("flagged");
    expect(result.evidenceDeescalationApplied).toBe(false);
  });

  it("does not apply the override to high_risk posts, even with strong evidence", () => {
    const result = determinePostStatus({
      ...base,
      aiLabel: "high_risk",
    });
    expect(result.status).toBe("flagged");
    expect(result.evidenceDeescalationApplied).toBe(false);
  });

  it("still forces flagged on strong contradiction evidence, regardless of verification score", () => {
    const result = determinePostStatus({
      ...base,
      contradictionCount: 3,
      groundingConfidence: 90, // 0.9 confidence -> forcing threshold
    });
    expect(result.status).toBe("flagged");
    expect(result.contradictionForcingApplied).toBe(true);
    expect(result.evidenceDeescalationApplied).toBe(false);
  });

  it("still routes to expert review for a sensitive-topic post, even with strong evidence", () => {
    const result = determinePostStatus({
      ...base,
      needsExpertReview: true,
    });
    expect(result.status).toBe("under_expert_review");
    expect(result.evidenceDeescalationApplied).toBe(false);
  });
});
