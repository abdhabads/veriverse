import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Follow from "@/models/Follow";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { getUserFromRequest, requireActiveUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { isValidObjectId } from "@/lib/validation";
import { hasBidirectionalBlock } from "@/lib/messaging";

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
      const followsYouStates: Record<string, boolean> = {};

      const otherIds = validIds.filter((id) => id !== String(user._id));
      if (otherIds.length > 0) {
        const [follows, followers] = await Promise.all([
          Follow.find({
            follower: user._id,
            following: { $in: otherIds },
          }).select("following"),
          // Reverse direction in one bounded query, not one per user -
          // efficiently served by the existing {follower:1, following:1}
          // index (follower is an $in on the leading key).
          Follow.find({
            follower: { $in: otherIds },
            following: user._id,
          }).select("follower"),
        ]);
        const followingSet = new Set(follows.map((item: any) => String(item.following)));
        const followerSet = new Set(followers.map((item: any) => String(item.follower)));
        for (const id of otherIds) {
          states[id] = followingSet.has(id);
          followsYouStates[id] = followerSet.has(id);
        }
      }

      // Self is included as false rather than omitted, consistent with the
      // single-target form's own self behavior below.
      if (validIds.includes(String(user._id))) {
        states[String(user._id)] = false;
        followsYouStates[String(user._id)] = false;
      }

      return NextResponse.json({ success: true, states, followsYouStates });
    }

    const targetUserId = searchParams.get("targetUserId");
    if (!targetUserId) {
      return NextResponse.json({ success: false, message: "Target user required" }, { status: 400 });
    }

    if (String(user._id) === targetUserId) {
      return NextResponse.json({ success: true, following: false, followsYou: false, mutual: false });
    }

    const [following, followsYou] = await Promise.all([
      Follow.exists({ follower: user._id, following: targetUserId }),
      Follow.exists({ follower: targetUserId, following: user._id }),
    ]);

    return NextResponse.json({
      success: true,
      following: Boolean(following),
      followsYou: Boolean(followsYou),
      mutual: Boolean(following) && Boolean(followsYou),
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to fetch follow state" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

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

    const blocked = await hasBidirectionalBlock(String(user._id), targetUserId);
    if (blocked) {
      return NextResponse.json(
        { success: false, message: "You cannot follow this user" },
        { status: 403 }
      );
    }

    await Follow.create({
      follower: user._id,
      following: targetUserId,
    });

    try {
      await Notification.create({
        user: targetUserId,
        type: "new_follower",
        message: `${user.username} started following you.`,
      });
    } catch (notifyError) {
      // The follow itself already succeeded - a failed notification must
      // not turn a successful follow into an apparent failure.
      console.error("Failed to create new-follower notification:", notifyError);
    }

    return NextResponse.json({
      success: true,
      message: "Followed",
      following: true,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to follow" }, { status: 500 });
  }
}
