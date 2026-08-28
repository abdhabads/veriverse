import type { ContentType } from "@/lib/aiModeration";

export type GroundingPlan = {
  skipGrounding: boolean;
  groundingQuery: string;
};

/**
 * Decides whether the truth pipeline should run grounding/verification at
 * all, and what text to ground against.
 *
 * "claim" and "rhetorical_claim" always get fully evaluated through the
 * exact same grounding/scoring/escalation path as any other post -
 * "rhetorical_claim" only changes *what text* gets graded (the extracted
 * assertion instead of the rhetorical wrapper), never whether it gets
 * graded. That's deliberate: a dangerous claim can't dodge verification by
 * being phrased as a loaded question. Only "question"/"instruction" with
 * no extractable assertion skip grounding.
 */
export function resolveGroundingPlan(input: {
  content: string;
  contentType: ContentType;
  extractedClaim: string | null;
}): GroundingPlan {
  const { content, contentType, extractedClaim } = input;

  if (contentType === "question" || contentType === "instruction") {
    return { skipGrounding: true, groundingQuery: content };
  }

  if (contentType === "rhetorical_claim" && extractedClaim) {
    return { skipGrounding: false, groundingQuery: extractedClaim };
  }

  // "claim", or a "rhetorical_claim" the classifier failed to extract an
  // assertion for - fail toward full evaluation on the original text
  // rather than ever skipping it.
  return { skipGrounding: false, groundingQuery: content };
}
