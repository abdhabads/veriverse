// Cheap, deterministic, NON-GATING signal for whether a post looks like a
// question/instruction rather than a claim. This never decides pipeline
// behaviour on its own - see lib/contentTypeRouting.ts, which is driven
// entirely by the LLM classifier's contentType. This heuristic exists only
// to flag when it disagrees with the classifier, as a cheap monitoring
// signal for prompt drift (e.g. "how often does the classifier call
// something a claim that reads like a plain question, or vice versa").
//
// It is deliberately crude and known to misfire on rhetorical/loaded
// questions ("Isn't it true that X?") and on claims that happen to start
// with a wh-word ("What caused the crash was Y") - that's expected and is
// exactly the kind of case the classifier is supposed to get right where
// this heuristic can't.
const WH_WORDS = /^(what|why|how|when|where|who|whom|whose|which|isn'?t it true|is it true)\b/i;

const IMPERATIVE_VERBS =
  /^(provide|explain|list|describe|compare|define|give|tell|show|name|outline|summarize|summarise|discuss|identify|write|create|walk me through|help me)\b/i;

export type NonClaimHeuristicResult = {
  looksLikeNonClaim: boolean;
  reason: string | null;
};

export function heuristicNonClaimCheck(content: string): NonClaimHeuristicResult {
  const trimmed = content.trim();

  if (/\?\s*$/.test(trimmed)) {
    return { looksLikeNonClaim: true, reason: "ends with ?" };
  }
  if (WH_WORDS.test(trimmed)) {
    return { looksLikeNonClaim: true, reason: "starts with wh-word" };
  }
  if (IMPERATIVE_VERBS.test(trimmed)) {
    return { looksLikeNonClaim: true, reason: "starts with imperative verb" };
  }

  return { looksLikeNonClaim: false, reason: null };
}

export type HeuristicMismatch = {
  mismatch: boolean;
  heuristic: NonClaimHeuristicResult;
};

/**
 * Compares the heuristic against the classifier-driven skipGrounding
 * decision (the actual, authoritative outcome). The heuristic never
 * changes behaviour - this only reports whether they disagreed, for
 * logging.
 */
export function detectHeuristicMismatch(
  content: string,
  skipGrounding: boolean
): HeuristicMismatch {
  const heuristic = heuristicNonClaimCheck(content);
  return {
    mismatch: heuristic.looksLikeNonClaim !== skipGrounding,
    heuristic,
  };
}
