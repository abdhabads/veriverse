import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { verifyCaptchaToken } from "@/lib/captcha";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey, getClientIp } from "@/lib/requestIdentity";
import { cleanString, isValidEmail } from "@/lib/validation";
import { fail } from "@/lib/apiResponse";
import { NextResponse } from "next/server";

// Fixed placeholder hash used only to give a nonexistent-email attempt
// roughly the same bcrypt cost as a real wrong-password attempt, narrowing
// the timing side-channel between the two. Not tied to any real account -
// never generated per-request, never persisted.
const DUMMY_PASSWORD_HASH =
  "$2b$10$x.nDbsETmYxpJ3HfBKNUZuBUcsXHDeLtXkXkg94/vb6c00PzI8mBy";

export async function POST(req: Request) {
  try {
    await connectDB();
    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "login"),
      windowMs: 60 * 1000,
      max: 10,
      message: "Too many login attempts. Please wait a minute.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();

    const email = cleanString(body.email, { maxLength: 120 });
    const password = typeof body.password === "string" ? body.password : "";
    const captchaToken =
      typeof body.captchaToken === "string" ? body.captchaToken : "";

    if (!email || !password) {
      return fail("Email and password are required.", 400);
    }

    if (!isValidEmail(email)) {
      return fail("Please enter a valid email address.", 400);
    }

    const captchaCheck = await verifyCaptchaToken(captchaToken, getClientIp(req));
    if (!captchaCheck.success) {
      return fail(captchaCheck.message || "Captcha verification failed", 400);
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Dummy comparison only - there is no real hash to check against, but
      // running one keeps this branch's timing close to a real wrong-
      // password attempt below, and the response is identical either way.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return fail("Invalid credentials", 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return fail("Invalid credentials", 401);
    }

    // Account-specific moderation state is only safe to disclose after the
    // caller has proven they know the password - never before.
    if (user.isDeactivated) {
      return fail("This account has been deactivated. You can restore it from the login page.", 403);
    }

    if (user.moderationStatus === "banned") {
      return fail("This account has been banned.", 403);
    }

    if (user.moderationStatus === "suspended") {
      if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
        return fail(
          `This account is suspended until ${new Date(
            user.suspendedUntil
          ).toLocaleString()}.`,
          403
        );
      }

      user.moderationStatus = "active";
      user.suspendedUntil = null;
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      user: {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        reputation: user.reputation,
        rewardPoints: user.rewardPoints,
        role: user.role,
        avatarUrl: user.avatarUrl || "",
        badges: user.badges || [],
        onboardingCompleted: Boolean(user.onboardingCompleted),
      },
    });

    response.cookies.set("veriverse_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("POST /api/login error:", error);
    return fail("Login failed", 500);
  }
}
