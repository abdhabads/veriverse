import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import { getUserIdFromRequest } from "@/lib/auth";

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

// P3.7: Top Contributors respects the viewer's own block/mute list, same
// established pattern as Search/Trending/Experts (UserRelation exclusion on
// top of moderation exclusion) - anonymous viewers see moderation-filtered
// results only. Ranking itself (reputation desc, rewardPoints desc, limit
// 20) is unchanged; only which rows a given viewer sees can differ, which is
// exactly why this list must never be presented as an immutable global rank.
export async function GET(req: Request) {
  try {
    await connectDB();
    const requesterId = getUserIdFromRequest(req);

    let excludedIds: string[] = [];
    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");
      excludedIds = relations.map((item: any) => String(item.targetUser));
    }

    const users = await User.find({
      ...availableUserFilter(),
      ...(excludedIds.length > 0 ? { _id: { $nin: excludedIds } } : {}),
    })
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
