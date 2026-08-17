import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

const MAX_AVATAR_DATA_URL_LENGTH = 800_000;

function isAcceptedAvatarValue(value: string): boolean {
  if (!value) return true;

  if (value.startsWith("data:image/")) {
    return value.length <= MAX_AVATAR_DATA_URL_LENGTH;
  }

  return /^https?:\/\//i.test(value);
}

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    if (user.isDeactivated) {
      return NextResponse.json(
        { success: false, message: "This account has been deactivated." },
        { status: 403 }
      );
    }

    const posts = await Post.find({ author: user._id })
      .select("content status createdAt trustDecisionVersion")
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        reputation: user.reputation,
        rewardPoints: user.rewardPoints,
        badges: user.badges,
        role: user.role,
        moderationStatus: user.moderationStatus,
        suspendedUntil: user.suspendedUntil,
      },
      posts,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to load profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    if (user.isDeactivated) {
      return NextResponse.json(
        { success: false, message: "This account has been deactivated." },
        { status: 403 }
      );
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "update_profile", String(user._id)),
      windowMs: 60 * 1000,
      max: 10,
      message: "Too many profile updates. Please wait a moment.",
    });
    if (limitResponse) return limitResponse;

    const { username, bio, avatarUrl } = await req.json();
    const nextUsername = typeof username === "string" ? username.trim() : "";
    const nextAvatarUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : "";

    if (nextUsername && nextUsername !== user.username) {
      const existing = await User.findOne({
        username: nextUsername,
        _id: { $ne: user._id },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, message: "Username already taken" },
          { status: 409 }
        );
      }

      user.username = nextUsername;
    }

    if (!isAcceptedAvatarValue(nextAvatarUrl)) {
      return NextResponse.json(
        {
          success: false,
          message: "Avatar must be an image upload or a valid URL under the size limit.",
        },
        { status: 400 }
      );
    }

    user.bio = bio?.trim?.() || "";
    user.avatarUrl = nextAvatarUrl;

    await user.save();

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        reputation: user.reputation,
        rewardPoints: user.rewardPoints,
        badges: user.badges,
        role: user.role,
        moderationStatus: user.moderationStatus,
        suspendedUntil: user.suspendedUntil,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to update profile" },
      { status: 500 }
    );
  }
}
