import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import { getUserIdFromRequest } from "@/lib/auth";

// Mirrors the exact unavailable-account semantics already enforced by
// Search (app/api/search/route.ts) and at login. A suspension that has
// expired is not treated as unavailable.
const now = () => new Date();

function unavailableUserFilter() {
  return {
    $or: [
      { isDeactivated: true },
      { moderationStatus: "banned" },
      { moderationStatus: "suspended", suspendedUntil: { $gt: now() } },
    ],
  };
}

type RouteContext = {
  params: Promise<{ tag: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { tag } = await context.params;

    // P2.7: aligns topic pages with the exact filtering convention Search
    // already uses - previously this route excluded nothing at all, so a
    // topic page could show posts from an author the viewer had blocked or
    // muted, or from a banned/deactivated account, when Search (browsing
    // the same underlying claims) would not have. Block/mute is
    // viewer-specific and only meaningful for an authenticated requester;
    // the moderation-unavailable exclusion applies regardless of who's
    // viewing, same as Search.
    const requesterId = getUserIdFromRequest(req);

    let excludedAuthorIds: string[] = [];
    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");
      excludedAuthorIds = relations.map((item: any) => String(item.targetUser));
    }

    const moderationExcluded = await User.find(unavailableUserFilter()).select("_id");
    const authorExclusions = [
      ...excludedAuthorIds,
      ...moderationExcluded.map((item: any) => String(item._id)),
    ];

    const posts = await Post.find({
      hashtags: tag.toLowerCase(),
      ...(authorExclusions.length > 0 ? { author: { $nin: authorExclusions } } : {}),
    })
      .populate("author", "username reputation avatarUrl badges")
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      tag: tag.toLowerCase(),
      posts,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch topic" },
      { status: 500 }
    );
  }
}
