// app/api/profile/account/restore/route.ts
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cleanString, isValidEmail } from "@/lib/validation";
import { fail } from "@/lib/apiResponse";
import { NextResponse } from "next/server";
import AuditLog from "@/models/AuditLog";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

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
      key: getRateLimitKey(req, "account_restore"),
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: "Too many restore attempts. Please wait 15 minutes.",
    });
    if (limitResponse) return limitResponse;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim().length > 0) body = JSON.parse(text);
    } catch {
      return fail("Invalid JSON in request body", 400);
    }

    const email = cleanString(body.email as string, { maxLength: 120 });
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return fail("Email and password are required.", 400);
    }

    if (!isValidEmail(email)) {
      return fail("Please enter a valid email address.", 400);
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Dummy comparison only - there is no real hash to check against, but
      // running one keeps this branch's timing close to a real wrong-
      // password attempt below. Same message as login to prevent account
      // enumeration.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return fail("Invalid credentials.", 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return fail("Invalid credentials.", 401);
    }

    // Account-specific state is only safe to disclose after the caller has
    // proven they know the password - never before.
    if (!user.isDeactivated) {
      return fail("This account is not deactivated.", 400);
    }

    if (user.moderationStatus === "banned") {
      return fail("This account has been banned and cannot be restored.", 403);
    }

    // Restore the account
    user.isDeactivated = false;
    user.deactivatedAt = null;
    user.deletionEligibleAt = null;
    await user.save();

    await AuditLog.create({
      actor: user._id,
      actorRole: user.role,
      actionType: "account_self_restored",
      note: `User ${user.username} restored their own account.`,
    });

    // Issue a fresh session so user is logged in immediately after restore
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    const response = NextResponse.json({
      success: true,
      message: "Account restored successfully. Welcome back.",
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
    console.error("POST /api/profile/account/restore error:", error);
    return fail("Failed to restore account.", 500);
  }
}
