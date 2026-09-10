import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Follow from "@/models/Follow";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { isValidObjectId } from "@/lib/validation";

// Aligned with Search's own max People results (app/api/search/route.ts),
// so a single results page can always be resolved in one request.
const MAX_BATCH_TARGETS = 20;

export async function GET(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const targetUserIdsParam = searchParams.get("targetUserIds");

    // Batched form: ?targetUserIds=id1,id2,... - added for Search's People
    // results. Entirely separate from, and does not alter, the single-
    // target form below.
    if (targetUserIdsParam !== null) {
      const requestedIds = targetUserIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (requestedIds.length > MAX_BATCH_TARGETS) {
        return NextResponse.json(
          { success: false, message: `Too many target users (max ${MAX_BATCH_TARGETS})` },
          { status: 400 }
        );
      }

      const validIds = requestedIds.filter((id) => isValidObjectId(id));
      const states: Record<string, boolean> = {};

      const otherIds = validIds.filter((id) => id !== String(user._id));
      if (otherIds.length > 0) {
        const follows = await Follow.find({
          follower: user._id,
          following: { $in: otherIds },
        }).select("following");
        const followingSet = new Set(follows.map((item: any) => String(item.following)));
        for (const id of otherIds) {
          states[id] = followingSet.has(id);
        }
      }

      // Self is included as false rather than omitted, consistent with the
      // single-target form's own self behavior below.
      if (validIds.includes(String(user._id))) {
        states[String(user._id)] = false;
      }

      return NextResponse.json({ success: true, states });
    }

    const targetUserId = searchParams.get("targetUserId");
    if (!targetUserId) {
      return NextResponse.json({ success: false, message: "Target user required" }, { status: 400 });
    }

    if (String(user._id) === targetUserId) {
      return NextResponse.json({ success: true, following: false });
    }

    const existing = await Follow.exists({
      follower: user._id,
      following: targetUserId,
    });

    return NextResponse.json({ success: true, following: Boolean(existing) });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to fetch follow state" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "follow", String(user._id)),
      windowMs: 60 * 1000,
      max: 30,
      message: "Too many follow actions. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const { targetUserId } = await req.json();

    if (!targetUserId) {
      return NextResponse.json({ success: false, message: "Target user required" }, { status: 400 });
    }

    if (String(user._id) === targetUserId) {
      return NextResponse.json({ success: false, message: "Cannot follow yourself" }, { status: 400 });
    }

    const existing = await Follow.findOne({
      follower: user._id,
      following: targetUserId,
    });

    if (existing) {
      await Follow.deleteOne({ _id: existing._id });

      return NextResponse.json({
        success: true,
        message: "Unfollowed",
        following: false,
      });
    }

    await Follow.create({
      follower: user._id,
      following: targetUserId,
    });

    return NextResponse.json({
      success: true,
      message: "Followed",
      following: true,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to follow" }, { status: 500 });
  }
}
