import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import RewardLog from "@/models/RewardLog";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const logs = await RewardLog.find({ user: user._id })
      .populate("referencePost", "content status")
      .sort({ createdAt: -1 })
      .limit(50);

    const freshUser = await User.findById(user._id).select("rewardPoints reputation username");

    return NextResponse.json({
      success: true,
      logs,
      totalRewardPoints: freshUser?.rewardPoints || 0,
      rewardPoints: freshUser?.rewardPoints || 0,
      reputation: freshUser?.reputation || 0,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch rewards" },
      { status: 500 }
    );
  }
}