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

  const posts = await mongoose.connection.db.collection("posts").find({
    status: "under_expert_review",
    finalized: { $ne: true },
    $or: [
      { expertDecision: { $exists: false } },
      { expertDecision: "" },
      { expertDecision: null },
    ],
  }).toArray();

  let updatedCount = 0;
  let normalizedGroundingCount = 0;

  for (const post of posts) {
    const normalizedGroundingStatus = normalizeGroundingStatus(post);
    const needsReview = requiresExpertReview({ ...post, groundingStatus: normalizedGroundingStatus });
    const status = nextStatus(post, needsReview);

    const update = {
      status,
      needsExpertReview: needsReview,
      groundingStatus: normalizedGroundingStatus,
    };

    const changed =
      post.status !== update.status ||
      Boolean(post.needsExpertReview) !== update.needsExpertReview ||
      (post.groundingStatus || "not_checked") !== update.groundingStatus;

    if (!changed) continue;

    await mongoose.connection.db.collection("posts").updateOne(
      { _id: post._id },
      {
        $set: update,
      }
    );

    updatedCount += 1;
    if (post.groundingStatus !== normalizedGroundingStatus) {
      normalizedGroundingCount += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: posts.length,
        updated: updatedCount,
        normalizedGroundingStatus: normalizedGroundingCount,
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