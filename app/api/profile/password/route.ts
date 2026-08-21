import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { isStrongEnoughPassword } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

export async function PATCH(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "password_change", String(user._id)),
      windowMs: 60 * 60 * 1000,
      max: 5,
      message: "Too many password change attempts. Please try again later.",
    });
    if (limitResponse) return limitResponse;

    const body = await req.json();
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json(
        { success: false, message: "Current and new password are required" },
        { status: 400 }
      );
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Current and new password are required" },
        { status: 400 }
      );
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return NextResponse.json(
        { success: false, message: "New password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "New password must be different from your current password",
        },
        { status: 400 }
      );
    }

    if (typeof user.password !== "string" || !user.password) {
      console.error("Password update failed: user has no stored password", {
        userId: String(user._id),
      });

      return NextResponse.json(
        {
          success: false,
          message: "This account cannot update its password right now",
        },
        { status: 400 }
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect" },
        { status: 401 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Failed to update password", error);

    return NextResponse.json(
      { success: false, message: "Failed to update password" },
      { status: 500 }
    );
  }
}
