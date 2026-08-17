import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { applyGroundingRiskFloor, mapRiskToLabel } from "../lib/truthScoring";

type BackfillArgs = {
  dryRun: boolean;
  limit?: number;
};

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

function parseArgs(argv: string[]): BackfillArgs {
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  return {
    dryRun,
    limit: Number.isFinite(limit) && limit && limit > 0 ? Math.floor(limit) : undefined,
  };
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hasContradictorySource(document: Record<string, any>): boolean {
  return Array.isArray(document.groundingSources)
    ? document.groundingSources.some((source) => source?.stance === "contradicts")
    : false;
}

function nextRiskState(document: Record<string, any>) {
  const contradictionCount = Math.max(
    normalizeNumber(document.contradictionCount, 0),
    hasContradictorySource(document) ? 1 : 0
  );
  const aiRiskScore = applyGroundingRiskFloor({
    baseScore: normalizeNumber(document.aiRiskScore, 0),
    contradictionCount,
    groundingConfidence: normalizeNumber(document.groundingConfidence, 0),
    groundingStatus: document.groundingStatus,
  });
  const aiLabel = mapRiskToLabel(aiRiskScore);
  const moderationReasons = Array.isArray(document.moderationReasons)
    ? [...document.moderationReasons]
    : [];

  if (contradictionCount > 0 && !moderationReasons.includes("Grounding found contradictory evidence")) {
    moderationReasons.push("Grounding found contradictory evidence");
  }

  return {
    aiRiskScore,
    aiLabel,
    moderationReasons,
  };
}

async function backfillCollection(options: {
  collectionName: string;
  limit?: number;
  dryRun: boolean;
}) {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not available");
  }

  const collection = db.collection(options.collectionName);
  const documents = await collection.find({}, { limit: options.limit }).toArray();

  let updated = 0;

  for (const document of documents) {
    const next = nextRiskState(document);
    const currentReasons = Array.isArray(document.moderationReasons) ? document.moderationReasons : [];
    const changed =
      normalizeNumber(document.aiRiskScore, 0) !== next.aiRiskScore ||
      String(document.aiLabel || "") !== next.aiLabel ||
      JSON.stringify(currentReasons) !== JSON.stringify(next.moderationReasons);

    if (!changed) {
      continue;
    }

    updated += 1;

    if (!options.dryRun) {
      await collection.updateOne(
        { _id: document._id },
        {
          $set: {
            aiRiskScore: next.aiRiskScore,
            aiLabel: next.aiLabel,
            moderationReasons: next.moderationReasons,
          },
        }
      );
    }
  }

  return {
    scanned: documents.length,
    updated,
  };
}

async function main() {
  loadEnvFile();

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  const args = parseArgs(process.argv.slice(2));

  await mongoose.connect(process.env.MONGO_URI);

  const [posts, snapshots] = await Promise.all([
    backfillCollection({ collectionName: "posts", limit: args.limit, dryRun: args.dryRun }),
    backfillCollection({ collectionName: "posttrustsnapshots", limit: args.limit, dryRun: args.dryRun }),
  ]);

  console.log(JSON.stringify({ dryRun: args.dryRun, posts, snapshots }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});