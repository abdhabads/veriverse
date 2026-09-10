import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import Follow from "@/models/Follow";
import { requireActiveUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { isValidObjectId } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    await connectDB();
    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "relations", String(user._id)),
      windowMs: 60 * 1000,
      max: 20,
      message: "Too many block/mute actions. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const { targetUserId, relationType } = await req.json();

    if (!targetUserId || !["block", "mute"].includes(relationType)) {
      return NextResponse.json(
        { success: false, message: "Invalid request" },
        { status: 400 }
      );
    }

    if (!isValidObjectId(targetUserId)) {
      return NextResponse.json(
        { success: false, message: "Invalid target user" },
        { status: 400 }
      );
    }

    if (String(user._id) === String(targetUserId)) {
      return NextResponse.json(
        { success: false, message: `You cannot ${relationType} yourself` },
        { status: 400 }
      );
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: "Target user not found" },
        { status: 404 }
      );
    }

    const existing = await UserRelation.findOne({
      sourceUser: user._id,
      targetUser: targetUserId,
      relationType,
    });

    if (existing) {
      await UserRelation.deleteOne({ _id: existing._id });

      const res = NextResponse.json({
        success: true,
        active: false,
        relationType,
        message: `${relationType} removed`,
      });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }

    try {
      await UserRelation.create({
        sourceUser: user._id,
        targetUser: targetUserId,
        relationType,
      });
    } catch (createError: any) {
      if (createError?.code !== 11000) throw createError;
      // Another concurrent request created the identical relation first -
      // it's active either way, so report success rather than a spurious
      // failure.
    }

    if (relationType === "block") {
      // Block is a reciprocal interaction boundary - neither party should
      // retain an active Follow relationship across it. Mute never touches
      // Follow.
      await Follow.deleteMany({
        $or: [
          { follower: user._id, following: targetUserId },
          { follower: targetUserId, following: user._id },
        ],
      });
    }

    const res = NextResponse.json({
      success: true,
      active: true,
      relationType,
      message: `${relationType} applied`,
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("POST /api/relations error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update relation" },
      { status: 500 }
    );
  }
}
