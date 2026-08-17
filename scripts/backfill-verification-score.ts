import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { calculateVerificationScore, summarizeGroundingSources } from "../lib/groundingMetrics";

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

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function computeVerificationScore(document: Record<string, any>) {
  const sources = Array.isArray(document.groundingSources) ? document.groundingSources : [];
  const summarized = summarizeGroundingSources(sources);

  return calculateVerificationScore(
    {
      groundingConfidence: normalizeNumber(document.groundingConfidence, summarized.groundingConfidence),
      contradictionCount: normalizeNumber(document.contradictionCount, summarized.contradictionCount),
      supportCount: normalizeNumber(document.supportCount, summarized.supportCount),
      contextCount: summarized.contextCount,
    },
    typeof document.groundingStatus === "string" ? document.groundingStatus : "not_checked"
  );
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
  const cursor = collection.find({}, { limit: options.limit });
  const documents = await cursor.toArray();

  let updated = 0;

  for (const document of documents) {
    const verificationScore = computeVerificationScore(document);
    const currentScore = normalizeNumber(document.verificationScore, -1);

    if (currentScore === verificationScore) {
      continue;
    }

    updated += 1;

    if (!options.dryRun) {
      await collection.updateOne(
        { _id: document._id },
        { $set: { verificationScore } }
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
    backfillCollection({
      collectionName: "posts",
      limit: args.limit,
      dryRun: args.dryRun,
    }),
    backfillCollection({
      collectionName: "posttrustsnapshots",
      limit: args.limit,
      dryRun: args.dryRun,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        posts,
        snapshots,
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