import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/apiResponse";

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

    if (user.isDeactivated) {
      return fail("This account has been deactivated.", 403);
    }

    if (user.moderationStatus === "banned") {
      return fail("This account has been banned.", 403);
    }

    if (user.moderationStatus === "suspended") {
      if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
        return fail("This account is currently suspended.", 403);
      }

      user.moderationStatus = "active";
      user.suspendedUntil = null;
      await user.save();
    }

    return ok({
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl || "",
        reputation: Number(user.reputation || 0),
        rewardPoints: Number(user.rewardPoints || 0),
        badges: Array.isArray(user.badges) ? user.badges : [],
        role: user.role,
        onboardingCompleted: Boolean(user.onboardingCompleted),
        moderationStatus: user.moderationStatus,
        suspendedUntil: user.suspendedUntil,
      },
    });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to verify access" },
      { status: 500 }
    );
  }
}
