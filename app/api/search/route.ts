import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Post from "@/models/Post";
import UserRelation from "@/models/UserRelation";
import { getUserIdFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

// Mirrors the exact unavailable-account semantics already enforced at login
// (app/api/login/route.ts): deactivated, banned, or currently-suspended
// accounts. A suspension that has expired is not treated as unavailable,
// matching login's own auto-reactivation behavior.
const now = () => new Date();

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

function unavailableUserFilter() {
  return {
    $or: [
      { isDeactivated: true },
      { moderationStatus: "banned" },
      { moderationStatus: "suspended", suspendedUntil: { $gt: now() } },
    ],
  };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const requesterId = getUserIdFromRequest(req);

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "search", requesterId || undefined),
      windowMs: 60 * 1000,
      max: 30,
      message: "You are searching too quickly. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const type = (searchParams.get("type") || "all").trim();

    if (!q) {
      const res = NextResponse.json({
        success: true,
        users: [],
        posts: [],
        hashtags: [],
      });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    // Block/mute exclusions, same UserRelation pattern already proven by
    // the Discovery and Following feeds - only meaningful for an
    // authenticated requester.
    let excludedAuthorIds: string[] = [];
    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");
      excludedAuthorIds = relations.map((item: any) => String(item.targetUser));
    }

    let users: any[] = [];
    let posts: any[] = [];
    let hashtags: string[] = [];

    if (type === "all" || type === "users") {
      users = await User.find({
        username: { $regex: regex },
        ...availableUserFilter(),
        ...(excludedAuthorIds.length > 0
          ? { _id: { $nin: excludedAuthorIds } }
          : {}),
      })
        .select("username reputation rewardPoints avatarUrl badges bio")
        .limit(20);
    }

    if (type === "all" || type === "posts") {
      const moderationExcluded = await User.find(unavailableUserFilter()).select("_id");
      const postAuthorExclusions = [
        ...excludedAuthorIds,
        ...moderationExcluded.map((item: any) => String(item._id)),
      ];

      posts = await Post.find({
        $or: [
          { content: { $regex: regex } },
          { hashtags: q.toLowerCase() },
        ],
        ...(postAuthorExclusions.length > 0
          ? { author: { $nin: postAuthorExclusions } }
          : {}),
      })
        .populate("author", "username reputation avatarUrl badges")
        .sort({ createdAt: -1 })
        .limit(30);
    }

    const hashtagMatches = await Post.aggregate([
      { $unwind: "$hashtags" },
      {
        $match: {
          hashtags: { $regex: regex },
        },
      },
      {
        $group: {
          _id: "$hashtags",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    hashtags = hashtagMatches.map((item) => item._id);

    const res = NextResponse.json({
      success: true,
      users,
      posts,
      hashtags,
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to search" },
      { status: 500 }
    );
  }
}
