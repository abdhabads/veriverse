export type ExpertReviewReason =
  | "Sensitive topic in content"
  | "Sensitive hashtag"
  | "Elevated AI risk score"
  | "Contradictory evidence detected"
  | "Sensitive claim lacks enough evidence";

export function getExpertReviewReasons(
  content: string,
  hashtags: string[],
  aiRiskScore: number = 0,
  groundingStatus: "checked" | "insufficient_evidence" | "not_checked" = "not_checked",
  groundingSources: Array<{ stance: "supports" | "contradicts" | "context" | "unknown" }> = []
): ExpertReviewReason[] {
  const text = content.toLowerCase();

  const sensitiveKeywords = [
    "health",
    "cure",
    "treatment",
    "diabetes",
    "diabetic",
    "insulin",
    "foot ulcer",
    "wound",
    "amputation",
    "neuropathy",
    "debridement",
    "gangrene",
    "sepsis",
    "blood glucose",
    "blood sugar",
    "hyperglycaemia",
    "hypoglycaemia",
    "metformin",
    "cancer",
    "tumour",
    "chemotherapy",
    "hiv",
    "aids",
    "stroke",
    "heart disease",
    "hypertension",
    "blood pressure",
    "kidney disease",
    "renal failure",
    "liver disease",
    "mental health",
    "depression",
    "antidepressant",
    "psychiatric",
    "vaccine",
    "mmr",
    "ivermectin",
    "antibiotic",
    "antibiotics",
    "infection",
    "septicaemia",
    "election",
    "vote rigging",
    "government",
    "disease",
    "outbreak",
    "pandemic",
    "war",
    "security alert",
    "legal advice",
  ];

  const sensitiveTags = [
    "health",
    "politics",
    "election",
    "law",
    "security",
    "medical",
  ];

  const keywordHit = sensitiveKeywords.some((keyword) => text.includes(keyword));
  const tagHit = hashtags.some((tag) => sensitiveTags.includes(tag.toLowerCase()));
  const contradictionHit = groundingSources.some(
    (source) => source.stance === "contradicts"
  );
  const evidenceGapOnSensitiveClaim =
    groundingStatus === "insufficient_evidence" &&
    (keywordHit || tagHit || aiRiskScore >= 20);

  const reasons: ExpertReviewReason[] = [];

  if (keywordHit) {
    reasons.push("Sensitive topic in content");
  }

  if (tagHit) {
    reasons.push("Sensitive hashtag");
  }

  if (aiRiskScore >= 35) {
    reasons.push("Elevated AI risk score");
  }

  if (contradictionHit && aiRiskScore >= 45) {
    reasons.push("Contradictory evidence detected");
  }

  if (evidenceGapOnSensitiveClaim) {
    reasons.push("Sensitive claim lacks enough evidence");
  }

  return [...new Set(reasons)];
}

export function requiresExpertReview(
  content: string,
  hashtags: string[],
  aiRiskScore: number = 0,
  groundingStatus: "checked" | "insufficient_evidence" | "not_checked" = "not_checked",
  groundingSources: Array<{ stance: "supports" | "contradicts" | "context" | "unknown" }> = [],
  groundingConfidence: number = 0,
  contradictionCount: number = 0
): boolean {
  const text = content.toLowerCase();

  const sensitiveKeywords = [
    "health",
    "cure",
    "treatment",
    "diabetes",
    "diabetic",
    "insulin",
    "foot ulcer",
    "wound",
    "amputation",
    "neuropathy",
    "debridement",
    "gangrene",
    "sepsis",
    "blood glucose",
    "blood sugar",
    "hyperglycaemia",
    "hypoglycaemia",
    "metformin",
    "cancer",
    "tumour",
    "chemotherapy",
    "hiv",
    "aids",
    "stroke",
    "heart disease",
    "hypertension",
    "blood pressure",
    "kidney disease",
    "renal failure",
    "liver disease",
    "mental health",
    "depression",
    "antidepressant",
    "psychiatric",
    "vaccine",
    "mmr",
    "ivermectin",
    "antibiotic",
    "antibiotics",
    "infection",
    "septicaemia",
    "election",
    "vote rigging",
    "government",
    "disease",
    "outbreak",
    "pandemic",
    "war",
    "security alert",
    "legal advice",
    "vaccine",
    "medicine",
    "financial advice",
  ];

  const sensitiveTags = [
    "health",
    "politics",
    "election",
    "law",
    "security",
    "medical",
    "finance",
  ];

  const keywordHit = sensitiveKeywords.some((keyword) => text.includes(keyword));
  const tagHit = hashtags.some((tag) => sensitiveTags.includes(tag.toLowerCase()));
  const contradictionHit =
    contradictionCount > 0 ||
    groundingSources.some((source) => source.stance === "contradicts");

  if (contradictionHit && aiRiskScore >= 30) return true;
  if (groundingStatus === "insufficient_evidence" && (keywordHit || tagHit)) return true;
  if (groundingConfidence >= 60 && contradictionCount >= 2) return true;

  return keywordHit || tagHit || aiRiskScore >= 35;
}
