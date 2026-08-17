import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import OpenAI from "openai";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const allowFallback = argv.includes("--allow-fallback");
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  return {
    dryRun,
    allowFallback,
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined,
  };
}

function isPlaceholder(value) {
  if (!value) return true;
  const normalized = String(value).trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("your_openai") ||
    normalized.includes("your_text_model") ||
    normalized.includes("your_vector_store") ||
    normalized === "changeme"
  );
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (isPlaceholder(apiKey)) {
    throw new Error("OPENAI_API_KEY is not configured for truth-pipeline backfill");
  }

  return new OpenAI({ apiKey });
}

function clampRiskScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampAdjustment(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function mapRiskToLabel(score) {
  if (score >= 75) return "high_risk";
  if (score >= 45) return "needs_review";
  if (score >= 20) return "suspicious";
  return "safe";
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function medicalClaimSeverityReason(score) {
  if (score >= 75) return "Severe medical cure claim";
  if (score >= 45) return "Escalated medical cure claim";
  return "Medical cure claim";
}

function localFallback(content) {
  const text = String(content || "").toLowerCase();
  let score = 0;
  const reasons = [];

  const absoluteClaimPattern = /(?:\b100\s*%|\b100 percent\b|\bguaranteed\b|\bguarantee\b|\bproven\b|\binstant\b|\bpermanent\b|\bworks every time\b)/;
  const medicalCurePattern = /\b(cure|cures|cured|treatment|treatments|heal|heals|healed|reverse|reverses|reversed|eliminate|eliminates|eradicate|eradicates)\b/;
  const seriousConditionPattern = /\b(cancer|tumou?r|diabetes|hiv|aids|covid|coronavirus|pandemic|disease|illness|autism|alzheimer'?s|dementia|stroke|heart disease|infertility)\b/;
  const universalScopePattern = /\b(any type of|all types of|every kind of|works for everyone|for everyone|for anybody)\b/;
  const suppressionPattern = /\b(big pharma|hidden cure|suppressed cure|doctors hate this|they don't want you to know)\b/;

  const rules = [
    { keyword: "miracle cure", points: 35, reason: "Medical misinformation pattern" },
    { keyword: "100% guaranteed", points: 20, reason: "Absolute certainty claim" },
    { keyword: "government hiding this", points: 20, reason: "Conspiracy framing" },
    { keyword: "election rigged", points: 30, reason: "Election misinformation pattern" },
    { keyword: "pandemic hoax", points: 35, reason: "Public health misinformation pattern" },
    { keyword: "they don't want you to know", points: 20, reason: "Manipulative sensational phrasing" },
  ];

  for (const rule of rules) {
    if (text.includes(rule.keyword)) {
      score += rule.points;
      reasons.push(rule.reason);
    }
  }

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

  if (hasMedicalCureClaim) {
    score += 40;
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

  const exclamationCount = (String(content || "").match(/!/g) || []).length;
  if (exclamationCount >= 4) {
    score += 10;
    reasons.push("Sensational punctuation pattern");
  }

  const aiRiskScore = clampRiskScore(score);

  if (hasMedicalCureClaim) {
    reasons.unshift(medicalClaimSeverityReason(aiRiskScore));
  }

  return {
    aiLabel: mapRiskToLabel(aiRiskScore),
    aiRiskScore,
    moderationReasons: [...new Set(reasons)],
    provider: "fallback",
    raw: null,
  };
}

async function runSafetyModeration(client, content) {
  const moderation = await client.moderations.create({
    model: "omni-moderation-latest",
    input: content,
  });

  const result = moderation.results?.[0];
  if (!result) {
    return { flagged: false, reasons: [], scoreBoost: 0 };
  }

  const categories = result.categories ?? {};
  const categoryScores = result.category_scores ?? {};
  const triggeredReasons = [];
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

async function runMisinformationClassifier(client, content) {
  const model = process.env.OPENAI_TEXT_MODEL;

  if (isPlaceholder(model)) {
    throw new Error("OPENAI_TEXT_MODEL is not configured for truth-pipeline backfill");
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
      { role: "system", content: prompt },
      { role: "user", content },
    ],
  });

  const outputText = response.output_text;
  if (!outputText || typeof outputText !== "string") {
    throw new Error("Classifier returned no text output");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Classifier returned invalid JSON");
  }

  return {
    baseRiskScore:
      typeof parsed?.baseRiskScore === "number"
        ? clampRiskScore(parsed.baseRiskScore)
        : 0,
    reasons: normalizeReasons(parsed?.reasons),
    raw: parsed,
  };
}

async function screenContentWithAI(client, content, failOpen) {
  const aiEnabled = process.env.AI_ENABLED !== "false";

  if (!aiEnabled) {
    return localFallback(content);
  }

  if (!client) {
    if (failOpen) {
      return localFallback(content);
    }

    throw new Error("OpenAI client is required for truth-pipeline screening");
  }

  try {
    const [safety, classifier] = await Promise.all([
      runSafetyModeration(client, content),
      runMisinformationClassifier(client, content),
    ]);

    const aiRiskScore = clampRiskScore(classifier.baseRiskScore + safety.scoreBoost);
    const moderationReasons = [...classifier.reasons, ...safety.reasons];

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

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function runGroundedFactCheck(client, content) {
  if (!client) {
    throw new Error("OpenAI client is required for grounded fact-check backfill");
  }

  const model = process.env.OPENAI_TEXT_MODEL;
  if (isPlaceholder(model)) {
    throw new Error("OPENAI_TEXT_MODEL is not configured for grounded fact-check backfill");
  }

  const response = await client.responses.create({
    model,
    include: ["web_search_call.action.sources"],
    tools: [{ type: "web_search_preview" }],
    input: [
      {
        role: "system",
        content: `
You are a source-grounded claim checker for a misinformation-aware social platform.

Your job:
1. Search the web for trustworthy sources relevant to the user's post.
2. Determine whether the best available sources support, contradict, or only contextualize the core claim.
3. Return JSON only.

Required JSON shape:
{
  "groundingStatus": "checked" | "insufficient_evidence",
  "groundingSummary": string,
  "groundingSources": [
    {
      "title": string,
      "url": string,
      "stance": "supports" | "contradicts" | "context" | "unknown"
    }
  ],
  "evidenceRiskAdjustment": number
}

Rules:
- Prefer authoritative or broadly trusted sources.
- If evidence strongly contradicts the claim, use a positive adjustment like +10 to +25.
- If evidence strongly supports the claim, use a negative adjustment like -5 to -20.
- If evidence is mixed or weak, use a small adjustment or 0.
- Keep source list short: max 5.
- Return JSON only.
        `.trim(),
      },
      { role: "user", content },
    ],
  });

  const outputText = response.output_text;
  if (!outputText || typeof outputText !== "string") {
    throw new Error("Grounded fact check returned no text");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Grounded fact check returned invalid JSON");
  }

  const groundingSources = Array.isArray(parsed.groundingSources)
    ? parsed.groundingSources
        .filter((item) => item && typeof item.url === "string")
        .slice(0, 5)
        .map((item) => ({
          title: typeof item.title === "string" ? item.title.trim() : "",
          url: item.url.trim(),
          domain: extractDomain(item.url.trim()),
          stance: ["supports", "contradicts", "context", "unknown"].includes(item.stance)
            ? item.stance
            : "unknown",
        }))
    : [];

  return {
    groundingStatus: parsed.groundingStatus === "checked" ? "checked" : "insufficient_evidence",
    groundingSummary:
      typeof parsed.groundingSummary === "string"
        ? parsed.groundingSummary.trim().slice(0, 500)
        : "",
    groundingSources,
    evidenceRiskAdjustment: clampAdjustment(parsed.evidenceRiskAdjustment || 0, -25, 25),
    raw: parsed,
  };
}

async function runInternalGrounding(client, content) {
  if (!client) {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }

  const model = process.env.OPENAI_TEXT_MODEL;
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;

  if (isPlaceholder(model) || isPlaceholder(vectorStoreId)) {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }

  const response = await client.responses.create({
    model,
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
      },
    ],
    include: ["file_search_call.results"],
    input: [
      {
        role: "system",
        content: `
You are checking a user post against trusted internal reference documents.
Return JSON only in this shape:

{
  "internalSummary": string,
  "internalEvidenceAdjustment": number,
  "internalSources": [
    { "file_name": string, "score": number }
  ]
}

Use:
- negative adjustment if trusted internal documents support the claim
- positive adjustment if they contradict it
- 0 if there is not enough evidence
        `.trim(),
      },
      { role: "user", content },
    ],
  });

  const outputText = response.output_text;
  if (!outputText || typeof outputText !== "string") {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }

  try {
    const parsed = JSON.parse(outputText);
    return {
      internalSummary:
        typeof parsed.internalSummary === "string"
          ? parsed.internalSummary.trim().slice(0, 500)
          : "",
      internalEvidenceAdjustment: clampAdjustment(parsed.internalEvidenceAdjustment || 0, -20, 20),
      internalSources: Array.isArray(parsed.internalSources)
        ? parsed.internalSources.slice(0, 5)
        : [],
    };
  } catch {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }
}

function emptyWebGrounding() {
  return {
    groundingStatus: "not_checked",
    groundingSummary: "",
    groundingSources: [],
    evidenceRiskAdjustment: 0,
    raw: undefined,
  };
}

function emptyInternalGrounding() {
  return {
    internalSummary: "",
    internalEvidenceAdjustment: 0,
    internalSources: [],
  };
}

function normalizeGroundingStatus(input) {
  if (
    input.provider === "fallback" &&
    input.groundingStatus === "insufficient_evidence" &&
    !String(input.groundingSummary || "").trim() &&
    Array.isArray(input.groundingSources) &&
    input.groundingSources.length === 0
  ) {
    return "not_checked";
  }

  return input.groundingStatus;
}

function normalizeStance(value) {
  if (
    value === "supports" ||
    value === "contradicts" ||
    value === "context" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function getSourceLabel(source) {
  return String(source?.title || "").trim() || String(source?.domain || "").trim() || "Fact-check source";
}

function createModerationSourceReason(source) {
  const url = String(source?.url || "").trim();
  if (!url) return null;

  return [
    "fact_check_source::",
    encodeURIComponent(normalizeStance(source?.stance)),
    "|",
    encodeURIComponent(getSourceLabel(source)),
    "|",
    encodeURIComponent(url),
  ].join("");
}

function getExpertReviewReasons(content, hashtags, aiRiskScore = 0, groundingStatus = "not_checked", groundingSources = []) {
  const text = String(content || "").toLowerCase();
  const safeHashtags = Array.isArray(hashtags) ? hashtags : [];

  const sensitiveKeywords = [
    "health",
    "cure",
    "treatment",
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

  const sensitiveTags = ["health", "politics", "election", "law", "security", "medical"];

  const keywordHit = sensitiveKeywords.some((keyword) => text.includes(keyword));
  const tagHit = safeHashtags.some((tag) => sensitiveTags.includes(String(tag).toLowerCase()));
  const contradictionHit = groundingSources.some((source) => source?.stance === "contradicts");
  const evidenceGapOnSensitiveClaim =
    groundingStatus === "insufficient_evidence" &&
    (keywordHit || tagHit || aiRiskScore >= 20);

  const reasons = [];
  if (keywordHit) reasons.push("Sensitive topic in content");
  if (tagHit) reasons.push("Sensitive hashtag");
  if (aiRiskScore >= 35) reasons.push("Elevated AI risk score");
  if (contradictionHit && aiRiskScore >= 45) reasons.push("Contradictory evidence detected");
  if (evidenceGapOnSensitiveClaim) reasons.push("Sensitive claim lacks enough evidence");

  return [...new Set(reasons)];
}

function extractHashtags(text) {
  const matches = String(text || "").match(/#([a-zA-Z0-9_]+)/g) || [];
  return [...new Set(matches.map((item) => item.replace("#", "").toLowerCase()))];
}

function hashContent(input) {
  return crypto.createHash("sha256").update(String(input).trim().toLowerCase()).digest("hex");
}

async function evaluateContentTruthPipeline(client, content, failOpen) {
  const baseScreening = await screenContentWithAI(client, content, failOpen);

  const [webGrounding, internalGrounding] = await Promise.all([
    client
      ? runGroundedFactCheck(client, content).catch((error) => {
          if (failOpen) {
            console.warn("Grounded fact check failed, continuing with neutral grounding:", error.message || error);
            return emptyWebGrounding();
          }

          throw error;
        })
      : Promise.resolve(emptyWebGrounding()),
    client
      ? runInternalGrounding(client, content).catch((error) => {
          if (failOpen) {
            console.warn("Internal grounding failed, continuing with neutral internal evidence:", error.message || error);
            return emptyInternalGrounding();
          }

          throw error;
        })
      : Promise.resolve(emptyInternalGrounding()),
  ]);

  const adjustedScore = clampRiskScore(
    baseScreening.aiRiskScore +
      webGrounding.evidenceRiskAdjustment +
      internalGrounding.internalEvidenceAdjustment
  );

  const combinedReasons = [
    ...baseScreening.moderationReasons,
    ...(webGrounding.groundingSummary ? [`Grounding: ${webGrounding.groundingSummary}`] : []),
    ...webGrounding.groundingSources
      .map((source) => createModerationSourceReason(source))
      .filter(Boolean)
      .slice(0, 3),
    ...(internalGrounding.internalSummary
      ? [`Internal grounding: ${internalGrounding.internalSummary}`]
      : []),
  ];

  return {
    aiLabel: mapRiskToLabel(adjustedScore),
    aiRiskScore: adjustedScore,
    moderationReasons: [...new Set(combinedReasons)].slice(0, 10),
    provider: baseScreening.provider,
    raw: {
      base: baseScreening.raw,
      webGrounding: webGrounding.raw,
      internalGrounding,
      contentHash: hashContent(`6:${content}`),
    },
    groundingStatus: normalizeGroundingStatus({
      groundingStatus: webGrounding.groundingStatus,
      groundingSummary: webGrounding.groundingSummary || internalGrounding.internalSummary,
      groundingSources: webGrounding.groundingSources,
      provider: baseScreening.provider,
    }),
    groundingSummary: webGrounding.groundingSummary || internalGrounding.internalSummary,
    groundingSources: webGrounding.groundingSources,
  };
}

function nextStatus(screening, needsExpertReview) {
  if (screening.aiLabel === "high_risk") return "flagged";
  if (needsExpertReview) return "under_expert_review";
  if (screening.aiLabel === "suspicious") return "flagged";
  return "unverified";
}

function buildQuery() {
  return {
    finalized: { $ne: true },
    $and: [
      {
        $or: [
          { expertDecision: { $exists: false } },
          { expertDecision: "" },
          { expertDecision: null },
        ],
      },
      {
        $or: [
          { groundingSources: { $exists: false } },
          { groundingSources: { $size: 0 } },
        ],
      },
    ],
  };
}

async function main() {
  loadEnvFile();

  const { dryRun, allowFallback, limit } = parseArgs(process.argv.slice(2));
  const failOpen = process.env.AI_FAIL_OPEN === "true";

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  if (!allowFallback) {
    if (isPlaceholder(process.env.OPENAI_API_KEY) || isPlaceholder(process.env.OPENAI_TEXT_MODEL)) {
      throw new Error(
        "Truth-pipeline backfill requires real OPENAI_API_KEY and OPENAI_TEXT_MODEL. Use --allow-fallback only if you intentionally want fallback-only reprocessing."
      );
    }
  }

  const client = !isPlaceholder(process.env.OPENAI_API_KEY) ? getOpenAIClient() : null;

  if (!client && !allowFallback) {
    throw new Error("OpenAI client could not be initialized");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const collection = mongoose.connection.db.collection("posts");
  let cursor = collection.find(buildQuery()).sort({ createdAt: -1 });
  if (limit) {
    cursor = cursor.limit(limit);
  }

  const posts = await cursor.toArray();

  let updated = 0;
  let failed = 0;
  let fallbackRuns = 0;
  let expertReviewChanges = 0;

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];

    try {
      const screening = await evaluateContentTruthPipeline(
        client,
        String(post.content || ""),
        failOpen || allowFallback
      );
      const hashtags = extractHashtags(post.content || "");
      const expertReasons = getExpertReviewReasons(
        post.content || "",
        hashtags,
        screening.aiRiskScore,
        screening.groundingStatus,
        screening.groundingSources
      );
      const needsExpertReview = expertReasons.length > 0;
      const status = nextStatus(screening, needsExpertReview);

      const update = {
        hashtags,
        aiLabel: screening.aiLabel,
        aiRiskScore: screening.aiRiskScore,
        moderationReasons: screening.moderationReasons,
        groundingStatus: screening.groundingStatus,
        groundingSummary: screening.groundingSummary,
        groundingSources: screening.groundingSources,
        aiProvider: screening.provider,
        needsExpertReview,
        status,
      };

      const changed =
        JSON.stringify(Array.isArray(post.hashtags) ? post.hashtags : []) !== JSON.stringify(update.hashtags) ||
        post.aiLabel !== update.aiLabel ||
        Number(post.aiRiskScore || 0) !== update.aiRiskScore ||
        JSON.stringify(Array.isArray(post.moderationReasons) ? post.moderationReasons : []) !== JSON.stringify(update.moderationReasons) ||
        (post.groundingStatus || "not_checked") !== update.groundingStatus ||
        String(post.groundingSummary || "") !== update.groundingSummary ||
        JSON.stringify(Array.isArray(post.groundingSources) ? post.groundingSources : []) !== JSON.stringify(update.groundingSources) ||
        String(post.aiProvider || "") !== update.aiProvider ||
        Boolean(post.needsExpertReview) !== update.needsExpertReview ||
        String(post.status || "") !== update.status;

      if (!changed) {
        continue;
      }

      if (!dryRun) {
        await collection.updateOne(
          { _id: post._id },
          {
            $set: update,
          }
        );
      }

      updated += 1;
      if (screening.provider === "fallback") {
        fallbackRuns += 1;
      }
      if (Boolean(post.needsExpertReview) !== update.needsExpertReview || String(post.status || "") !== update.status) {
        expertReviewChanges += 1;
      }

      if ((index + 1) % 10 === 0) {
        console.log(`Processed ${index + 1}/${posts.length}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed to reprocess post ${post._id}:`, error?.message || error);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        allowFallback,
        scanned: posts.length,
        updated,
        failed,
        fallbackRuns,
        expertReviewChanges,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});