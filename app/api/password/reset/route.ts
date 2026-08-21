import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { isStrongEnoughPassword } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

export async function POST(req: Request) {
  try {
    await connectDB();
    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "reset_password"),
      windowMs: 60 * 1000,
      max: 8,
      message: "Too many reset attempts. Please wait a minute.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!token || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Token and new password are required." },
        { status: 400 }
      );
    }

    if (!isStrongEnoughPassword(newPassword)) {
      return NextResponse.json(
        { success: false, message: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user || typeof user.password !== "string" || !user.password) {
      return NextResponse.json(
        { success: false, message: "This reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return NextResponse.json(
        {
          success: false,
          message: "New password must be different from your current password.",
        },
        { status: 400 }
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = "";
    user.passwordResetExpiresAt = null;
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Failed to reset password", error);

    return NextResponse.json(
      { success: false, message: "Failed to reset password" },
      { status: 500 }
    );
  }
}