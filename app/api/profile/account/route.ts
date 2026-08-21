import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import User from "@/models/User";
import Post from "@/models/Post";
import Comment from "@/models/Comment";
import Vote from "@/models/Vote";
import Like from "@/models/Like";
import Repost from "@/models/Repost";
import SavedPost from "@/models/SavedPost";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import Appeal from "@/models/Appeal";
import Report from "@/models/Report";
import Notification from "@/models/Notification";
import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";
import AuditLog from "@/models/AuditLog";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

function withClearedAuthCookie(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });

  response.cookies.set("veriverse_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

async function validateUserPassword(
  user: any,
  password: string
): Promise<{ valid: true } | { valid: false; response: NextResponse }> {
  if (!password.trim()) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, message: "Password confirmation is required." },
        { status: 400 }
      ),
    };
  }

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, message: "Password confirmation failed." },
        { status: 401 }
      ),
    };
  }

  return { valid: true };
}

export async function PATCH(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "account_action", String(user._id)),
      windowMs: 60 * 60 * 1000,
      max: 5,
      message: "Too many account actions. Please try again later.",
    });
    if (limitResponse) return limitResponse;

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (action !== "deactivate") {
      return NextResponse.json({ success: false, message: "Invalid account action." }, { status: 400 });
    }

    if (user.isDeactivated) {
      return NextResponse.json({ success: false, message: "This account is already deactivated." }, { status: 409 });
    }

    const passwordCheck = await validateUserPassword(user, password);
    if (!passwordCheck.valid) {
      return passwordCheck.response;
    }

    const now = new Date();
    user.isDeactivated = true;
    user.deactivatedAt = now;
    // Permanent deletion not available until 24 hours after deactivation
    user.deletionEligibleAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await user.save();

    return withClearedAuthCookie({ success: true, message: "Account deactivated successfully." });
  } catch (error) {
    console.error("PATCH /api/profile/account error:", error);
    return NextResponse.json({ success: false, message: "Failed to deactivate account." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "account_delete", String(user._id)),
      windowMs: 60 * 60 * 1000,
      max: 3,
      message: "Too many deletion attempts. Please try again later.",
    });
    if (limitResponse) return limitResponse;

    const body = await req.json();
    const password = typeof body.password === "string" ? body.password : "";

    const passwordCheck = await validateUserPassword(user, password);
    if (!passwordCheck.valid) {
      return passwordCheck.response;
    }

    // Enforce cooling-off period - deletion not available until 24h after deactivation
    if (user.deletionEligibleAt && new Date() < new Date(user.deletionEligibleAt)) {
      const eligibleAt = new Date(user.deletionEligibleAt).toLocaleString();
      return NextResponse.json(
        {
          success: false,
          message: `Account deletion is not available yet. You can permanently delete your account after ${eligibleAt}.`,
          deletionEligibleAt: user.deletionEligibleAt,
        },
        { status: 403 }
      );
    }

    const userId = user._id;
    const authoredPosts = await Post.find({ author: userId }).select("_id").lean();
    const authoredPostIds = authoredPosts.map((post) => post._id);

    if (authoredPostIds.length > 0) {
      await Promise.all([
        Comment.deleteMany({ post: { $in: authoredPostIds } }),
        Vote.deleteMany({ post: { $in: authoredPostIds } }),
        Like.deleteMany({ post: { $in: authoredPostIds } }),
        Repost.deleteMany({ post: { $in: authoredPostIds } }),
        SavedPost.deleteMany({ post: { $in: authoredPostIds } }),
        Appeal.deleteMany({ post: { $in: authoredPostIds } }),
        Report.deleteMany({ post: { $in: authoredPostIds } }),
        Notification.deleteMany({ referencePost: { $in: authoredPostIds } }),
        RewardLog.deleteMany({ referencePost: { $in: authoredPostIds } }),
        ReputationLog.deleteMany({ referencePost: { $in: authoredPostIds } }),
        AuditLog.deleteMany({ targetPost: { $in: authoredPostIds } }),
      ]);
      await Post.deleteMany({ _id: { $in: authoredPostIds } });
    }

    // Write audit record before cascade - after deletion the user record is gone
    await AuditLog.create({
      actor: userId,
      actorRole: user.role,
      actionType: "account_self_deleted",
      note: `User ${user.username} (${user.email}) permanently deleted their account.`,
    });

    await Promise.all([
      Comment.deleteMany({ author: userId }),
      Vote.deleteMany({ user: userId }),
      Like.deleteMany({ user: userId }),
      Repost.deleteMany({ user: userId }),
      SavedPost.deleteMany({ user: userId }),
      Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
      UserRelation.deleteMany({ $or: [{ sourceUser: userId }, { targetUser: userId }] }),
      Appeal.deleteMany({ appellant: userId }),
      Report.deleteMany({ reporter: userId }),
      Notification.deleteMany({ user: userId }),
      RewardLog.deleteMany({ user: userId }),
      ReputationLog.deleteMany({ user: userId }),
      AuditLog.deleteMany({ $or: [{ actor: userId }, { targetUser: userId }] }),
      User.deleteOne({ _id: userId }),
    ]);

    return withClearedAuthCookie({ success: true, message: "Account deleted successfully." });
  } catch (error) {
    console.error("DELETE /api/profile/account error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete account." }, { status: 500 });
  }
}