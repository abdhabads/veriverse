import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function GET() {
  try {
    await connectDB();
    const users = await User.find()
      .select("username reputation rewardPoints badges role createdAt")
      .sort({ reputation: -1, rewardPoints: -1 })
      .limit(20);

    return NextResponse.json({
      success: true,
      users,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}