import { getOpenAIClient } from "@/lib/openai";

export type AiScreeningResult = {
  aiLabel: "safe" | "suspicious" | "needs_review" | "high_risk";
  aiRiskScore: number;
  moderationReasons: string[];
  provider: "openai" | "fallback";
  raw?: unknown;
};

type SafetySignals = {
  flagged: boolean;
  reasons: string[];
  scoreBoost: number;
};

function clampRiskScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeReasons(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function mapRiskToLabel(score: number): AiScreeningResult["aiLabel"] {
  if (score >= 75) return "high_risk";
  if (score >= 45) return "needs_review";
  if (score >= 20) return "suspicious";
  return "safe";
}

function medicalClaimSeverityReason(score: number): string {
  if (score >= 75) return "Severe medical cure claim";
  if (score >= 45) return "Escalated medical cure claim";
  return "Medical cure claim";
}

function localFallback(content: string): AiScreeningResult {
  const text = content.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // --- Exact phrase rules ---
  const phraseRules = [
    { keyword: "miracle cure", points: 35, reason: "Medical misinformation pattern" },
    { keyword: "100% guaranteed", points: 20, reason: "Absolute certainty claim" },
    { keyword: "government hiding this", points: 20, reason: "Conspiracy framing" },
    { keyword: "election rigged", points: 30, reason: "Election misinformation pattern" },
    { keyword: "pandemic hoax", points: 35, reason: "Public health misinformation pattern" },
    { keyword: "they don't want you to know", points: 20, reason: "Manipulative sensational phrasing" },
    { keyword: "doctors don't want", points: 20, reason: "Anti-medicine conspiracy framing" },
    { keyword: "big pharma hiding", points: 25, reason: "Pharmaceutical conspiracy framing" },
    { keyword: "natural cure for", points: 15, reason: "Unverified natural remedy claim" },
    { keyword: "cures all", points: 30, reason: "Overbroad cure claim" },
    { keyword: "guaranteed to cure", points: 35, reason: "Absolute medical cure claim" },
    { keyword: "proven to cure", points: 25, reason: "Unverified cure claim" },
    { keyword: "more effectively than standard", points: 25, reason: "Comparative efficacy claim against standard care" },
    { keyword: "as effectively as metformin", points: 30, reason: "False equivalence with prescription medication" },
    { keyword: "without the need for", points: 20, reason: "Claim replacing standard medical care" },
    { keyword: "unnecessary for", points: 20, reason: "Claim dismissing standard medical intervention" },
    { keyword: "shown to achieve complete", points: 25, reason: "Absolute outcome claim" },
    { keyword: "clinically proven to", points: 25, reason: "Unverified clinical proof claim" },
    { keyword: "has been shown in clinical studies", points: 20, reason: "Unverified clinical study citation" },
    { keyword: "immune response is sufficient", points: 20, reason: "Claim replacing standard medical treatment" },
    { keyword: "can continue normal weight-bearing", points: 15, reason: "Contradicts established wound care protocol" },
  ];

  for (const rule of phraseRules) {
    if (text.includes(rule.keyword)) {
      score += rule.points;
      reasons.push(rule.reason);
    }
  }

  // --- Medical misinformation patterns ---
  const absoluteClaimPattern =
    /(?:\b100\s*%|\b100 percent\b|\bguaranteed\b|\bguarantee\b|\bproven\b|\binstant\b|\bpermanent\b|\bworks every time\b)/;

  const medicalCurePattern =
    /\b(cure[sd]?|cures|treatment|treatments|heal[sed]?|healing|reverse[sd]?|eliminate[sd]?|eradicate[sd]?|miraculously? cures?|miraculous(?:ly)? heal|naturally? cures?|promotes? (?:faster |rapid )?healing|prevents? infection|more effective(?:ly)? than|as effective(?:ly)? as|shown to (?:achieve|reduce|improve|prevent)|clinically proven|has been shown|demonstrated efficacy|unnecessary for|not (?:needed|required|necessary) for)\b/;

  const seriousConditionPattern =
    /\b(cancer|tumou?r|diabetes|diabetic|hiv|aids|covid|coronavirus|pandemic|disease|illness|autism|alzheimer'?s|dementia|stroke|heart disease|infertility|sickle cell|anemia|anaemia|leukemia|leukaemia|multiple sclerosis|parkinson'?s|epilepsy|arthritis|foot ulcer|diabetic foot|wound|neuropathy|amputation|gangrene|sepsis|blood glucose|blood sugar|insulin|metformin|hypertension|blood pressure|kidney disease|renal|depression|mental health|vaccine|antibiotic|infection|ulcer)\b/;

  const universalScopePattern =
    /\b(any type of|all types of|every kind of|works for everyone|for everyone|for anybody|all cancers?|any disease)\b/;

  const suppressionPattern =
    /\b(big pharma|hidden cure|suppressed cure|doctors hate this|they don't want you to know|banned by|censored by)\b/;

  const hasMedicalCureClaim =
    medicalCurePattern.test(text) && seriousConditionPattern.test(text);
  const hasAbsoluteMedicalClaim =
    absoluteClaimPattern.test(text) &&
    medicalCurePattern.test(text) &&
    seriousConditionPattern.test(text);
  const hasUniversalMedicalClaim =
    universalScopePattern.test(text) && medicalCurePattern.test(text);
  const hasSuppressedCureNarrative =
    suppressionPattern.test(text) && medicalCurePattern.test(text);

  // Medical cure + serious condition is always elevated
  if (hasMedicalCureClaim) {
    score += 40;
    reasons.push(medicalClaimSeverityReason(score));
  }

  if (hasAbsoluteMedicalClaim) {
    score += 25;
    reasons.push("Absolute certainty in medical claim");
  }

  if (hasUniversalMedicalClaim) {
    score += 15;
    reasons.push("Overbroad medical effectiveness claim");
  }

  if (hasSuppressedCureNarrative) {
    score += 15;
    reasons.push("Suppressed cure narrative");
  }

  // --- False equivalence patterns ---
  // Catches claims like "X and Y have the same speed/weight/size" where X and Y
  // are categorically different things
  const falseEquivalencePattern =
    /\b(same (?:speed|weight|size|temperature|height|strength|power|iq|intelligence)|(?:as (?:fast|heavy|big|hot|strong|smart|powerful) as))\b/;

  const categoricallyDifferentPairs = [
    [/camel/, /speed ?boat|jet|rocket|airplane|aircraft/],
    [/snail/, /cheetah|car|train|plane/],
    [/human/, /light speed|sound speed/],
  ];

  if (falseEquivalencePattern.test(text)) {
    for (const [a, b] of categoricallyDifferentPairs) {
      if (a.test(text) && b.test(text)) {
        score += 25;
        reasons.push("False equivalence between categorically different things");
        break;
      }
    }
  }

  // --- Conspiracy framing patterns ---
  const conspiracyPattern =
    /\b(deep state|new world order|illuminati|chemtrails|microchip(?:ped| vaccine)|5g (?:causes|spreads)|flat earth|moon landing (?:fake|hoax)|crisis actor)\b/;

  if (conspiracyPattern.test(text)) {
    score += 30;
    reasons.push("Known conspiracy theory framing");
  }

  // --- Election misinformation ---
  const electionMisinfoPattern =
    /\b(election (?:was )?(?:stolen|rigged|fraud)|voting machines? (?:hacked|rigged)|ballots? (?:destroyed|fake|forged))\b/;

  if (electionMisinfoPattern.test(text)) {
    score += 30;
    reasons.push("Election misinformation pattern");
  }

  // --- Sensational punctuation ---
  const exclamationCount = (content.match(/!/g) || []).length;
  if (exclamationCount >= 4) {
    score += 10;
    reasons.push("Sensational punctuation pattern");
  }

  const aiRiskScore = clampRiskScore(score);

  return {
    aiLabel: mapRiskToLabel(aiRiskScore),
    aiRiskScore,
    moderationReasons: [...new Set(reasons)].slice(0, 8),
    provider: "fallback",
  };
}

async function runSafetyModeration(content: string): Promise<SafetySignals> {
  const client = getOpenAIClient();

  const moderation = await client.moderations.create({
    model: "omni-moderation-latest",
    input: content,
  });

  const result = moderation.results?.[0];
  if (!result) {
    return { flagged: false, reasons: [], scoreBoost: 0 };
  }

  const categories = result.categories ?? {};
  const categoryScores = (result as any).category_scores ?? {};

  const triggeredReasons: string[] = [];
  let scoreBoost = 0;

  for (const [key, value] of Object.entries(categories)) {
    if (value === true) {
      triggeredReasons.push(`Safety category flagged: ${key}`);
      scoreBoost += 20;
    }
  }

  for (const [key, value] of Object.entries(categoryScores)) {
    if (typeof value === "number" && value >= 0.5) {
      triggeredReasons.push(`Elevated safety risk: ${key}`);
      scoreBoost += 10;
    }
  }

  return {
    flagged: Boolean(result.flagged),
    reasons: [...new Set(triggeredReasons)].slice(0, 6),
    scoreBoost,
  };
}

async function runMisinformationClassifier(content: string): Promise<{
  baseRiskScore: number;
  reasons: string[];
  raw?: unknown;
}> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_TEXT_MODEL;

  if (!model) {
    throw new Error("OPENAI_TEXT_MODEL is not set");
  }

  const prompt = `
You are a misinformation-risk classifier for a social platform.
Analyze the user-submitted post and return JSON only.

This classifier only contributes misinformation-specific risk.
Platform safety policy risk is handled separately by the Moderations API.
Do not make final enforcement decisions. Expert review and community voting happen later.

Required JSON shape:
{
  "baseRiskScore": number,
  "reasons": string[]
}

Scoring guidance:
- 0 to 19 = likely safe
- 20 to 44 = suspicious
- 45 to 74 = needs review
- 75 to 100 = high risk

Focus on misinformation-style risk signals such as:
- unsupported factual certainty
- dangerous medical claims
- conspiracy framing
- manipulative or sensational phrasing
- claims likely to mislead public understanding

Do not judge style alone.
Return concise reasons only.
`.trim();

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: content,
      },
    ],
  });

  const outputText = (response as any).output_text;
  if (!outputText || typeof outputText !== "string") {
    throw new Error("Classifier returned no text output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Classifier returned invalid JSON");
  }

  const baseRiskScore =
    typeof (parsed as any)?.baseRiskScore === "number"
      ? clampRiskScore((parsed as any).baseRiskScore)
      : 0;

  const reasons = normalizeReasons((parsed as any)?.reasons);

  return {
    baseRiskScore,
    reasons,
    raw: parsed,
  };
}

export async function screenContentWithAI(
  content: string
): Promise<AiScreeningResult> {
  const aiEnabled = process.env.AI_ENABLED !== "false";
  const failOpen = process.env.AI_FAIL_OPEN === "true";

  if (!aiEnabled) {
    return localFallback(content);
  }

  try {
    const [safety, classifier] = await Promise.all([
      runSafetyModeration(content),
      runMisinformationClassifier(content),
    ]);

    // Safety moderation adds policy-risk boosts, while the classifier provides
    // misinformation-specific base risk. Final adjudication still happens in
    // the expert review and community voting flows outside this helper.
    const aiRiskScore = clampRiskScore(
      classifier.baseRiskScore + safety.scoreBoost
    );

    const moderationReasons = [
      ...classifier.reasons,
      ...safety.reasons,
    ];

    return {
      aiLabel: mapRiskToLabel(aiRiskScore),
      aiRiskScore,
      moderationReasons: [...new Set(moderationReasons)].slice(0, 6),
      provider: "openai",
      raw: {
        safetyFlagged: safety.flagged,
        classifier: classifier.raw,
      },
    };
  } catch (error) {
    if (failOpen) {
      return localFallback(content);
    }

    throw error;
  }
}