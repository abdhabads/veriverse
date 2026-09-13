// tests/unit/reputationPresentation.test.ts
//
// Pure mapping tests - no DB needed. Proves the P3.7 action-type -> label
// translation covers every currently-live actionType, falls back safely for
// anything unrecognized (a future or legacy actionType must never crash or
// leak the raw internal string), and that the voting-weight disclosure
// wording matches exactly what the product decision specified.
import { describe, it, expect } from "vitest";
import { getReputationActionLabel, REPUTATION_VOTING_WEIGHT_DISCLOSURE } from "@/lib/reputationPresentation";

describe("getReputationActionLabel", () => {
  it("maps every currently-live settlement action type to human-readable copy", () => {
    expect(getReputationActionLabel("accurate_post")).toBe("Your post was verified by the community");
    expect(getReputationActionLabel("false_post_penalty")).toBe("Your post was marked false by the community");
    expect(getReputationActionLabel("expert_verified_post")).toBe("Your post was verified by expert review");
    expect(getReputationActionLabel("expert_false_post_penalty")).toBe(
      "Your post was marked false by expert review"
    );
    expect(getReputationActionLabel("appeal_reversal")).toBe(
      "A prior outcome was reversed following an approved appeal"
    );
  });

  it("falls back to a neutral label for an unrecognized/legacy action type, never leaking the raw string", () => {
    const label = getReputationActionLabel("some_future_or_legacy_action_type");
    expect(label).toBe("Reputation adjustment");
    expect(label).not.toContain("some_future_or_legacy_action_type");
  });

  it("falls back safely for an empty string", () => {
    expect(getReputationActionLabel("")).toBe("Reputation adjustment");
  });
});

describe("REPUTATION_VOTING_WEIGHT_DISCLOSURE", () => {
  it("accurately discloses the real voting-weight effect without overstating it", () => {
    expect(REPUTATION_VOTING_WEIGHT_DISCLOSURE).toContain("weight of community votes");
    expect(REPUTATION_VOTING_WEIGHT_DISCLOSURE).toContain("does not determine the evidence-based assessment");
  });
});
