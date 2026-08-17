import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config({ path: ".env.local" });
import Post from "@/models/Post";
import GroundingCache from "@/models/GroundingCache";
import { evaluateContentTruthPipeline } from "@/lib/aiTruthPipeline";
import { requiresExpertReview } from "@/lib/expertReview";
import { extractHashtags } from "@/lib/hashtags";
import { evaluateContradictionForcing } from "@/lib/contradictionForcing";
import { setPostTrustStatus } from "@/lib/setPostTrustStatus";

const TARGET_CONTENT = [
  /sickle cell/i,
  /camels.*speed|speed.*camels/i,
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const posts = await Post.find({
    $or: TARGET_CONTENT.map((pattern) => ({ content: { $regex: pattern } })),
  }).lean();

  console.log(`Found ${posts.length} posts to reprocess`);

  for (const post of posts) {
    console.log("\n--- Reprocessing:", post.content.slice(0, 60));

    // Clear cache so fresh evaluation runs
    const { hashContent } = await import("@/lib/hash");
    const { TRUTH_PIPELINE_CACHE_VERSION } = await import("@/lib/aiTruthPipeline");
    const contentHash = hashContent(`${TRUTH_PIPELINE_CACHE_VERSION}:${post.content}`);
    await GroundingCache.deleteOne({ contentHash });
    console.log("Cache cleared");

    // Re-run pipeline
    const screening = await evaluateContentTruthPipeline(post.content);
    console.log("New aiLabel:", screening.aiLabel);
    console.log("New aiRiskScore:", screening.aiRiskScore);
    console.log("New verificationScore:", screening.verificationScore);
    console.log("New contradictionCount:", screening.contradictionCount);
    console.log("Provider:", screening.provider);

    const hashtags = extractHashtags(post.content);
    const needsExpertReview = requiresExpertReview(
      post.content,
      hashtags,
      screening.aiRiskScore,
      screening.groundingStatus,
      screening.groundingSources,
      screening.groundingConfidence,
      screening.contradictionCount
    );

    const forcingResult = evaluateContradictionForcing({
      contradictionCount: screening.contradictionCount ?? 0,
      groundingConfidence: (screening.groundingConfidence ?? 0) / 100,
      currentStatus: "unverified",
    });

    let newStatus = post.status as string;
    if (!post.finalized) {
      if (forcingResult.forced) {
        newStatus = forcingResult.targetStatus;
      } else if (screening.contradictionCount >= 2 && screening.groundingConfidence >= 60) {
        newStatus = "under_expert_review";
      } else if (screening.aiLabel === "high_risk") {
        newStatus = "flagged";
      } else if (needsExpertReview) {
        newStatus = "under_expert_review";
      } else if (screening.aiLabel === "suspicious" || screening.groundingStatus === "insufficient_evidence") {
        newStatus = "flagged";
      } else {
        newStatus = "unverified";
      }
    }

    console.log("New status:", newStatus);

    await Post.findByIdAndUpdate(post._id, {
      aiLabel: screening.aiLabel,
      aiRiskScore: screening.aiRiskScore,
      verificationScore: screening.verificationScore,
      contradictionCount: screening.contradictionCount,
      supportCount: screening.supportCount,
      groundingStatus: screening.groundingStatus,
      groundingSummary: screening.groundingSummary,
      groundingSources: screening.groundingSources,
      groundingConfidence: screening.groundingConfidence,
      moderationReasons: screening.moderationReasons,
      needsExpertReview,
      status: newStatus,
    });

    console.log("Post updated ✓");

    // Rate limit guard between posts
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  await mongoose.disconnect();
  console.log("\nReprocessing complete");
}

main().catch(console.error);
