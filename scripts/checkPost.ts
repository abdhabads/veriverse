import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config({ path: ".env.local" });
import Post from "@/models/Post";

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  
  const posts = await Post.find({
    content: { $regex: /sickle cell|camels|speed boat/i }
  })
  .select("content verificationScore aiRiskScore aiLabel status contradictionCount supportCount")
  .lean();

  for (const post of posts) {
    console.log("---");
    console.log("Content:", post.content.slice(0, 60));
    console.log("verificationScore:", post.verificationScore);
    console.log("aiRiskScore:", post.aiRiskScore);
    console.log("aiLabel:", post.aiLabel);
    console.log("status:", post.status);
    console.log("contradictionCount:", post.contradictionCount);
    console.log("supportCount:", post.supportCount);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
