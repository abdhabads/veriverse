import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import { getUserFromRequest } from "@/lib/auth";

const CANDIDATE_POOL_SIZE = 30;
const SUGGESTION_COUNT = 5;

const now = () => new Date();

// Mirrors the exact unavailable-account semantics already enforced at login
// and reused by search (app/api/login/route.ts, app/api/search/route.ts).
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

export async function GET(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const [alreadyFollowing, blockRelations, muteRelations] = await Promise.all([
      Follow.find({ follower: user._id }).select("following"),
      // Suggestions-scoped bidirectional block check, distinct from the
      // one-directional pattern used by Feed/Search - a user who has
      // blocked the requester (or vice versa) should never be suggested.
      UserRelation.find({
        relationType: "block",
        $or: [{ sourceUser: user._id }, { targetUser: user._id }],
      }).select("sourceUser targetUser"),
      UserRelation.find({ sourceUser: user._id, relationType: "mute" }).select("targetUser"),
    ]);

    const excludedIds = new Set<string>([String(user._id)]);
    for (const item of alreadyFollowing) excludedIds.add(String((item as any).following));
    for (const item of blockRelations) {
      excludedIds.add(String((item as any).sourceUser));
      excludedIds.add(String((item as any).targetUser));
    }
    for (const item of muteRelations) excludedIds.add(String((item as any).targetUser));

    // Bounded candidate pool of recently-joined available users - not an
    // activity-scoring signal, just the cheapest deterministic ordering
    // available without a new index or a background job.
    const candidates = await User.find({
      ...availableUserFilter(),
      _id: { $nin: Array.from(excludedIds) },
    })
      .select("username avatarUrl reputation")
      .sort({ createdAt: -1 })
      .limit(CANDIDATE_POOL_SIZE);

    const suggestions = candidates
      .slice()
      .sort((a: any, b: any) => Number(b.reputation || 0) - Number(a.reputation || 0))
      .slice(0, SUGGESTION_COUNT)
      .map((candidate: any) => ({
        _id: candidate._id,
        username: candidate.username,
        avatarUrl: candidate.avatarUrl || "",
        reputation: Number(candidate.reputation || 0),
      }));

    const res = NextResponse.json({ success: true, suggestions });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("GET /api/follow/suggestions error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
}
