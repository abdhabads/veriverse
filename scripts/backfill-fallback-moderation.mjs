import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

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

function clampRiskScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapRiskToLabel(score) {
  if (score >= 75) return "high_risk";
  if (score >= 45) return "needs_review";
  if (score >= 20) return "suspicious";
  return "safe";
}

function medicalClaimSeverityReason(score) {
  if (score >= 75) return "Severe medical cure claim";
  if (score >= 45) return "Escalated medical cure claim";
  return "Medical cure claim";
}

function computeFallbackModeration(content) {
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
    aiProvider: "fallback",
  };
}

function normalizeGroundingStatus(post) {
  const summary = typeof post.groundingSummary === "string" ? post.groundingSummary.trim() : "";
  const sources = Array.isArray(post.groundingSources) ? post.groundingSources : [];

  if (
    post.aiProvider === "fallback" &&
    post.groundingStatus === "insufficient_evidence" &&
    !summary &&
    sources.length === 0
  ) {
    return "not_checked";
  }

  return post.groundingStatus || "not_checked";
}

function requiresExpertReview(post) {
  const text = String(post.content || "").toLowerCase();
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
  const aiRiskScore = Number(post.aiRiskScore || 0);
  const groundingStatus = normalizeGroundingStatus(post);
  const groundingSources = Array.isArray(post.groundingSources) ? post.groundingSources : [];

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

  const sensitiveTags = [
    "health",
    "politics",
    "election",
    "law",
    "security",
    "medical",
  ];

  const keywordHit = sensitiveKeywords.some((keyword) => text.includes(keyword));
  const tagHit = hashtags.some((tag) => sensitiveTags.includes(String(tag).toLowerCase()));
  const contradictionHit = groundingSources.some((source) => source?.stance === "contradicts");
  const evidenceGapOnSensitiveClaim =
    groundingStatus === "insufficient_evidence" &&
    (keywordHit || tagHit || aiRiskScore >= 20);

  return keywordHit || tagHit || aiRiskScore >= 35 || (contradictionHit && aiRiskScore >= 45) || evidenceGapOnSensitiveClaim;
}

function nextStatus(post, needsExpertReview) {
  if (post.aiLabel === "high_risk") return "flagged";
  if (needsExpertReview) return "under_expert_review";
  if (post.aiLabel === "suspicious") return "flagged";
  return "unverified";
}

async function main() {
  loadEnvFile();

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const collection = mongoose.connection.db.collection("posts");
  const posts = await collection.find({
    aiProvider: "fallback",
    finalized: { $ne: true },
    $or: [
      { expertDecision: { $exists: false } },
      { expertDecision: "" },
      { expertDecision: null },
    ],
  }).toArray();

  let updated = 0;
  let relabeled = 0;
  let normalizedGroundingStatusCount = 0;

  for (const post of posts) {
    const moderation = computeFallbackModeration(post.content);
    const groundingStatus = normalizeGroundingStatus(post);
    const candidate = {
      ...post,
      ...moderation,
      groundingStatus,
    };
    const needsReview = requiresExpertReview(candidate);
    const status = nextStatus(candidate, needsReview);

    const update = {
      aiLabel: moderation.aiLabel,
      aiRiskScore: moderation.aiRiskScore,
      moderationReasons: moderation.moderationReasons,
      aiProvider: "fallback",
      groundingStatus,
      needsExpertReview: needsReview,
      status,
    };

    const changed =
      post.aiLabel !== update.aiLabel ||
      Number(post.aiRiskScore || 0) !== update.aiRiskScore ||
      JSON.stringify(post.moderationReasons || []) !== JSON.stringify(update.moderationReasons) ||
      (post.groundingStatus || "not_checked") !== update.groundingStatus ||
      Boolean(post.needsExpertReview) !== update.needsExpertReview ||
      post.status !== update.status;

    if (!changed) continue;

    await collection.updateOne(
      { _id: post._id },
      { $set: update }
    );

    updated += 1;
    if (post.aiLabel !== update.aiLabel || Number(post.aiRiskScore || 0) !== update.aiRiskScore) {
      relabeled += 1;
    }
    if ((post.groundingStatus || "not_checked") !== update.groundingStatus) {
      normalizedGroundingStatusCount += 1;
    }
  }

  console.log(JSON.stringify({ scanned: posts.length, updated, relabeled, normalizedGroundingStatus: normalizedGroundingStatusCount }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});