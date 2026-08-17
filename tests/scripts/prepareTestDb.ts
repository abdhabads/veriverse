import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
dotenv.config({ path: ".env.test.local" });

import User from "@/models/User";
import Post from "@/models/Post";
import Comment from "@/models/Comment";
import Appeal from "@/models/Appeal";
import Report from "@/models/Report";
import AuditLog from "@/models/AuditLog";
import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is missing");

  await mongoose.connect(uri);

  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    Appeal.deleteMany({}),
    Report.deleteMany({}),
    AuditLog.deleteMany({}),
    RewardLog.deleteMany({}),
    ReputationLog.deleteMany({}),
  ]);

  const password = await bcrypt.hash("Password123!", 10);

  const [admin, expert, userA, userB] = await User.create([
    {
      username: "admin1",
      email: "admin@test.com",
      password,
      role: "admin",
      reputation: 100,
      rewardPoints: 500,
      moderationStatus: "active",
      onboardingCompleted: true,
    },
    {
      username: "expert1",
      email: "expert@test.com",
      password,
      role: "expert",
      expertCategory: "health",
      reputation: 80,
      rewardPoints: 200,
      moderationStatus: "active",
      onboardingCompleted: true,
    },
    {
      username: "usera",
      email: "usera@test.com",
      password,
      role: "user",
      reputation: 15,
      rewardPoints: 50,
      moderationStatus: "active",
      onboardingCompleted: true,
    },
    {
      username: "userb",
      email: "userb@test.com",
      password,
      role: "user",
      reputation: 5,
      rewardPoints: 20,
      // FIX: was "active" - must be suspended for the moderation test
      moderationStatus: "suspended",
      isSuspended: true,
      suspendedUntil: new Date(Date.now() + 60 * 60 * 1000),
      onboardingCompleted: true,
    },
  ]);

  const seededCreatedAt = new Date(Date.now() - 10 * 60 * 1000);
  await User.collection.updateMany(
    { _id: { $in: [admin._id, expert._id, userA._id, userB._id] } },
    { $set: { createdAt: seededCreatedAt } }
  );

  await Post.create([
    // Post 1: safe post from userA - used by feed and vote tests
    {
      author: userA._id,
      content: "The local clinic opens at 8am tomorrow.",
      status: "unverified",
      aiLabel: "safe",
      aiRiskScore: 5,
      moderationReasons: [],
      hashtags: ["health"],
      endorseVotes: 0,
      opposeVotes: 0,
      endorseWeight: 0,
      opposeWeight: 0,
    },
    // Post 2: high-risk flagged post from userB
    {
      author: userB._id,
      content: "This miracle cure is 100% guaranteed!!!",
      status: "flagged",
      aiLabel: "high_risk",
      aiRiskScore: 85,
      moderationReasons: ["Medical misinformation pattern"],
      hashtags: ["health"],
      endorseVotes: 0,
      opposeVotes: 0,
      endorseWeight: 0,
      opposeWeight: 0,
      needsExpertReview: true,
    },
    // Post 3: FIX - expert queue was empty, this gives the expert something to review
    {
      author: userA._id,
      content: "Seeded post requiring expert review for e2e testing.",
      status: "under_expert_review",
      aiLabel: "needs_review",
      aiRiskScore: 72,
      moderationReasons: ["Sensitive topic flagged for expert review"],
      hashtags: ["health"],
      endorseVotes: 0,
      opposeVotes: 0,
      endorseWeight: 0,
      opposeWeight: 0,
      needsExpertReview: true,
    },
  ]);

  await mongoose.disconnect();
  console.log("✅ Test database prepared.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
