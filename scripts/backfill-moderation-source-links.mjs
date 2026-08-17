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
  const title = typeof source?.title === "string" ? source.title.trim() : "";
  const domain = typeof source?.domain === "string" ? source.domain.trim() : "";
  return title || domain || "Fact-check source";
}

function createModerationSourceReason(source) {
  const url = typeof source?.url === "string" ? source.url.trim() : "";

  if (!url) {
    return null;
  }

  return [
    "fact_check_source::",
    encodeURIComponent(normalizeStance(source?.stance)),
    "|",
    encodeURIComponent(getSourceLabel(source)),
    "|",
    encodeURIComponent(url),
  ].join("");
}

function parseModerationSourceReason(reason) {
  if (typeof reason !== "string" || !reason.startsWith("fact_check_source::")) {
    return null;
  }

  const payload = reason.slice("fact_check_source::".length);
  const [stancePart, labelPart, urlPart] = payload.split("|");

  if (!stancePart || !labelPart || !urlPart) {
    return null;
  }

  try {
    return {
      stance: normalizeStance(decodeURIComponent(stancePart)),
      label: decodeURIComponent(labelPart).trim() || "Fact-check source",
      url: decodeURIComponent(urlPart).trim(),
    };
  } catch {
    return null;
  }
}

function dedupeReasons(reasons) {
  const textReasons = [];
  const sourceReasons = [];
  const seenText = new Set();
  const seenSourceUrls = new Set();

  for (const reason of Array.isArray(reasons) ? reasons : []) {
    const parsed = parseModerationSourceReason(reason);

    if (parsed) {
      if (!parsed.url || seenSourceUrls.has(parsed.url)) {
        continue;
      }
      seenSourceUrls.add(parsed.url);
      sourceReasons.push(reason);
      continue;
    }

    if (typeof reason !== "string" || !reason.trim() || seenText.has(reason)) {
      continue;
    }

    seenText.add(reason);
    textReasons.push(reason);
  }

  return [...textReasons, ...sourceReasons];
}

function buildUpdatedReasons(post) {
  const existingReasons = Array.isArray(post.moderationReasons)
    ? post.moderationReasons
    : [];
  const sourceReasons = (Array.isArray(post.groundingSources) ? post.groundingSources : [])
    .map((source) => createModerationSourceReason(source))
    .filter(Boolean)
    .slice(0, 3);

  return dedupeReasons([...existingReasons, ...sourceReasons]).slice(0, 10);
}

async function main() {
  loadEnvFile();

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  const dryRun = process.argv.includes("--dry-run");

  await mongoose.connect(process.env.MONGO_URI);

  const collection = mongoose.connection.db.collection("posts");
  const posts = await collection
    .find({
      "groundingSources.0": { $exists: true },
    })
    .toArray();

  let updated = 0;
  let alreadyCurrent = 0;
  let sourceReasonCount = 0;

  for (const post of posts) {
    const nextReasons = buildUpdatedReasons(post);
    const prevReasons = Array.isArray(post.moderationReasons) ? post.moderationReasons : [];
    const addedCount = Math.max(0, nextReasons.length - prevReasons.length);
    const changed = JSON.stringify(prevReasons) !== JSON.stringify(nextReasons);

    if (!changed) {
      alreadyCurrent += 1;
      continue;
    }

    if (!dryRun) {
      await collection.updateOne(
        { _id: post._id },
        {
          $set: {
            moderationReasons: nextReasons,
          },
        }
      );
    }

    updated += 1;
    sourceReasonCount += addedCount;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned: posts.length,
        updated,
        alreadyCurrent,
        sourceReasonsAdded: sourceReasonCount,
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