import { describe, it, expect } from "vitest";
import { heuristicNonClaimCheck, detectHeuristicMismatch } from "@/lib/nonClaimHeuristic";

describe("heuristicNonClaimCheck", () => {
  it("flags a sentence ending in a question mark", () => {
    const r = heuristicNonClaimCheck("Is this website a scam?");
    expect(r.looksLikeNonClaim).toBe(true);
    expect(r.reason).toBe("ends with ?");
  });

  it("flags a sentence starting with a wh-word", () => {
    const r = heuristicNonClaimCheck("What's the difference between Narrow AI and General AI.");
    expect(r.looksLikeNonClaim).toBe(true);
    expect(r.reason).toBe("starts with wh-word");
  });

  it("flags a sentence starting with an imperative verb", () => {
    const r = heuristicNonClaimCheck("Provide two real-world examples of Narrow AI.");
    expect(r.looksLikeNonClaim).toBe(true);
    expect(r.reason).toBe("starts with imperative verb");
  });

  it("does not flag an ordinary declarative claim", () => {
    const r = heuristicNonClaimCheck("The Eiffel Tower is in Paris.");
    expect(r.looksLikeNonClaim).toBe(false);
  });

  it("known limitation: misfires on a declarative claim that starts with a wh-word", () => {
    // Documents why this heuristic is advisory-only, never gating - the
    // classifier is expected to get this case right where the regex can't.
    const r = heuristicNonClaimCheck("What caused the 2008 crash was subprime lending.");
    expect(r.looksLikeNonClaim).toBe(true);
  });
});

describe("detectHeuristicMismatch", () => {
  it("reports no mismatch when heuristic and classifier agree content is a claim", () => {
    const { mismatch } = detectHeuristicMismatch("The Eiffel Tower is in Paris.", false);
    expect(mismatch).toBe(false);
  });

  it("reports no mismatch when heuristic and classifier agree content is a non-claim", () => {
    const { mismatch } = detectHeuristicMismatch("What's the capital of France?", true);
    expect(mismatch).toBe(false);
  });

  it("logged, classifier still authoritative: reports a mismatch when the classifier fully evaluates a rhetorical question the heuristic thought looked like a plain question", () => {
    // skipGrounding: false here because the classifier correctly identified
    // an implied claim and routed it for evaluation, even though the
    // heuristic (seeing "?") flagged it as looking like a question. The
    // mismatch is surfaced for monitoring, but skipGrounding - the actual
    // behaviour - came entirely from the classifier, not this heuristic.
    const { mismatch, heuristic } = detectHeuristicMismatch(
      "Isn't it true that bleach cures infections?",
      false
    );
    expect(mismatch).toBe(true);
    expect(heuristic.looksLikeNonClaim).toBe(true);
  });

  it("reports a mismatch when the classifier treats declarative wh-word phrasing as a claim while the heuristic flags it", () => {
    const { mismatch, heuristic } = detectHeuristicMismatch(
      "What caused the 2008 crash was subprime lending.",
      false
    );
    expect(mismatch).toBe(true);
    expect(heuristic.looksLikeNonClaim).toBe(true);
  });
});
