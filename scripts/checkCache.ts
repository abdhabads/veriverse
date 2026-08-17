import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config({ path: ".env.local" });
import GroundingCache from "@/models/GroundingCache";

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const entries = await GroundingCache.find({
    contentPreview: {
      $regex: /sickle cell|camels|speed boat/i
    }
  }).lean();

  for (const entry of entries) {
    console.log("---");
    console.log("Content:", entry.contentPreview);
    console.log("aiLabel:", (entry.result as any)?.aiLabel);
    console.log("aiRiskScore:", (entry.result as any)?.aiRiskScore);
    console.log("provider:", (entry.result as any)?.provider);
    console.log("moderationReasons:", (entry.result as any)?.moderationReasons);
    console.log("groundingStatus:", (entry.result as any)?.groundingStatus);
    console.log("contradictionCount:", (entry.result as any)?.contradictionCount);
    console.log("verificationScore:", (entry.result as any)?.verificationScore);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
