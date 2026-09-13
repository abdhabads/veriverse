// lib/reputationPresentation.ts
//
// P3.7: pure presentation mapping from ReputationLog's internal actionType
// values (lib/trustActionTypes.ts) to human-readable copy - deliberately
// separate from that file, which stays protected/unmodified. Raw `reason`
// (free text, settlement-internal) and `trustEventKey`/`trustDecisionVersion`
// must never be rendered directly in the UI; this is the one place the
// translation from internal action type to safe, stable copy happens, so a
// legacy/unrecognized value falls back to a neutral label instead of ever
// leaking an internal string.
const ACTION_TYPE_LABELS: Record<string, string> = {
  accurate_post: "Your post was verified by the community",
  false_post_penalty: "Your post was marked false by the community",
  expert_verified_post: "Your post was verified by expert review",
  expert_false_post_penalty: "Your post was marked false by expert review",
  appeal_reversal: "A prior outcome was reversed following an approved appeal",
};

export function getReputationActionLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] || "Reputation adjustment";
}

export const REPUTATION_VOTING_WEIGHT_DISCLOSURE =
  "Reputation can affect the weight of community votes on posts. It does not determine the evidence-based assessment of a Claim.";
