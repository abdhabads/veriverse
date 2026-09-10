import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const now = () => new Date();

// Mirrors the exact unavailable-account semantics already enforced at login
// and reused by search/messaging/referral-suggestions (app/api/login/route.ts,
// app/api/search/route.ts): deactivated, banned, or currently-suspended
// accounts. An expired suspension is not treated as unavailable.
function availableUserFilter() {
  return {
    isDeactivated: { $ne: true },
    moderationStatus: { $ne: "banned" },
    $or: [
      { moderationStatus: { $ne: "suspended" } },
      { suspendedUntil: null },
      { suspendedUntil: { $lte: now() } },
    ],
  };
}

export async function GET() {
  try {
    await connectDB();
    const users = await User.find(availableUserFilter())
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
