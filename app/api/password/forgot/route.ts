import crypto from "crypto";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { cleanString, isValidEmail } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

const RESET_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  await connectDB();

  try {
    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "forgot_password"),
      windowMs: 60 * 1000,
      max: 5,
      message: "Too many reset requests. Please wait a minute.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();
    const email = cleanString(body?.email, { maxLength: 120 });

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const user = await User.findOne({ email });
    let resetUrl: string | undefined;

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const origin = new URL(req.url).origin;

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = new Date(Date.now() + RESET_WINDOW_MS);
      await user.save();

      resetUrl = `${origin}/reset-password?token=${token}`;
      console.info("Password reset requested", {
        userId: String(user._id),
        email: user.email,
        resetUrl,
      });
    }

    return NextResponse.json({
      success: true,
      message: "If that email exists, a password reset link is ready.",
      resetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
    });
  } catch (error) {
    console.error("Failed to create password reset request", error);

    return NextResponse.json(
      { success: false, message: "Failed to create password reset request" },
      { status: 500 }
    );
  }
}