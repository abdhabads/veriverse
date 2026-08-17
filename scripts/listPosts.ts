import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config({ path: ".env.local" });
import Post from "@/models/Post";

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const posts = await Post.find({})
    .select("content verificationScore aiRiskScore aiLabel status")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  for (const post of posts) {
    console.log("---");
    console.log("Content:", post.content.slice(0, 80));
    console.log("aiLabel:", post.aiLabel, "| riskScore:", post.aiRiskScore);
    console.log("verificationScore:", post.verificationScore);
    console.log("status:", post.status);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
