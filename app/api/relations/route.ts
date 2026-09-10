import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import { requireActiveUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

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

      return NextResponse.json({
        success: true,
        active: false,
        relationType,
        message: `${relationType} removed`,
      });
    }

    await UserRelation.create({
      sourceUser: user._id,
      targetUser: targetUserId,
      relationType,
    });

    return NextResponse.json({
      success: true,
      active: true,
      relationType,
      message: `${relationType} applied`,
    });
  } catch (error) {
    console.error("POST /api/relations error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update relation" },
      { status: 500 }
    );
  }
}
