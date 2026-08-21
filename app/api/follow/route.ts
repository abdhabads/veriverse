import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Follow from "@/models/Follow";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

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
