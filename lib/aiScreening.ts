export type AiScreeningResult = {
  aiLabel: "safe" | "suspicious" | "needs_review" | "high_risk";
  aiRiskScore: number;
  moderationReasons: string[];
};

const riskyKeywordRules = [
  { keyword: "miracle cure", points: 35, reason: "Medical misinformation pattern" },
  { keyword: "cure instantly", points: 35, reason: "Medical misinformation pattern" },
  { keyword: "100% guaranteed", points: 20, reason: "Absolute certainty claim" },
  { keyword: "government hiding this", points: 20, reason: "Conspiracy framing" },
  { keyword: "election rigged", points: 30, reason: "Election misinformation pattern" },
  { keyword: "secret truth", points: 15, reason: "Manipulative sensational phrasing" },
  { keyword: "they don't want you to know", points: 20, reason: "Manipulative sensational phrasing" },
  { keyword: "breaking secret", points: 15, reason: "Manipulative sensational phrasing" },
  { keyword: "pandemic hoax", points: 35, reason: "Public health misinformation pattern" },
  { keyword: "security alert", points: 20, reason: "Public safety sensitivity" },
];

export function screenContent(content: string): AiScreeningResult {
  const text = content.toLowerCase();
  let aiRiskScore = 0;
  const moderationReasons: string[] = [];

  for (const rule of riskyKeywordRules) {
    if (text.includes(rule.keyword)) {
      aiRiskScore += rule.points;
      moderationReasons.push(rule.reason);
    }
  }

  if (content.length > 700) {
    aiRiskScore += 10;
    moderationReasons.push("Long-form content requires additional review");
  }

  const exclamationCount = (content.match(/!/g) || []).length;
  if (exclamationCount >= 4) {
    aiRiskScore += 10;
    moderationReasons.push("Sensational punctuation pattern");
  }

  const uppercaseWords = content
    .split(/\s+/)
    .filter((word) => word.length >= 4 && word === word.toUpperCase());

  if (uppercaseWords.length >= 4) {
    aiRiskScore += 10;
    moderationReasons.push("Aggressive uppercase emphasis");
  }

  const uniqueReasons = [...new Set(moderationReasons)];

  let aiLabel: AiScreeningResult["aiLabel"] = "safe";

  if (aiRiskScore >= 60) {
    aiLabel = "high_risk";
  } else if (aiRiskScore >= 35) {
    aiLabel = "needs_review";
  } else if (aiRiskScore >= 15) {
    aiLabel = "suspicious";
  }

  return {
    aiLabel,
    aiRiskScore,
    moderationReasons: uniqueReasons,
  };
}
