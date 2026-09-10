import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Referral from "@/models/Referral";
import bcrypt from "bcryptjs";
import { verifyCaptchaToken } from "@/lib/captcha";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey, getClientIp } from "@/lib/requestIdentity";
import {
  cleanString,
  escapeRegexLiteral,
  isStrongEnoughPassword,
  isValidEmail,
  isValidObjectId,
  isValidUsername,
} from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";

// Mirrors the exact unavailable-account semantics already enforced at login
// (app/api/login/route.ts): deactivated, banned, or currently-suspended
// accounts cannot be a referral's attribution target. An expired suspension
// is not treated as unavailable, matching login's own auto-reactivation.
function isReferrerAvailable(referrer: {
  isDeactivated?: boolean;
  moderationStatus?: string;
  suspendedUntil?: Date | string | null;
}): boolean {
  if (referrer.isDeactivated) return false;
  if (referrer.moderationStatus === "banned") return false;
  if (
    referrer.moderationStatus === "suspended" &&
    referrer.suspendedUntil &&
    new Date(referrer.suspendedUntil) > new Date()
  ) {
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "register"),
      windowMs: 60 * 1000,
      max: 5,
      message: "Too many registration attempts. Please wait a minute.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();

    const username = cleanString(body.username, { maxLength: 30 });
    const email = cleanString(body.email, { maxLength: 120 });
    const password = typeof body.password === "string" ? body.password : "";
    const captchaToken =
      typeof body.captchaToken === "string" ? body.captchaToken : "";
    const agreedToTerms = body.agreedToTerms === true;

    if (!username || !email || !password) {
      return fail("Username, email, and password are required.", 400);
    }

    if (!agreedToTerms) {
      return fail("You must agree to the Terms of Service and Privacy Policy to continue.", 400);
    }

    if (!isValidEmail(email)) {
      return fail("Please enter a valid email address.", 400);
    }

    if (!isValidUsername(username)) {
      return fail(
        "Username must be 3-30 characters and can only include letters, numbers, underscores, dots, or hyphens.",
        400
      );
    }

    if (!isStrongEnoughPassword(password)) {
      return fail("Password must be at least 8 characters.", 400);
    }

    const captchaCheck = await verifyCaptchaToken(captchaToken, getClientIp(req));
    if (!captchaCheck.success) {
      return fail(captchaCheck.message || "Captcha verification failed", 400);
    }

    const usernameRegex = new RegExp(`^${escapeRegexLiteral(username)}$`, "i");
    const existingUser = await User.findOne({
      $or: [{ email }, { username: usernameRegex }],
    });

    if (existingUser) {
      return fail("A user with that email or username already exists.", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Referral attribution is best-effort and never authoritative from the
    // client beyond "here is the code from the URL" - the referrer is
    // independently resolved and validated server-side, and an
    // invalid/nonexistent/unavailable referrer must never block signup.
    const referrerId = typeof body.referrerId === "string" ? body.referrerId : "";
    let validReferrer: { _id: unknown } | null = null;
    if (referrerId && isValidObjectId(referrerId)) {
      const candidate = await User.findById(referrerId);
      if (candidate && isReferrerAvailable(candidate)) {
        validReferrer = candidate;
      }
    }

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "user",
      termsAcceptedAt: new Date(),
    });

    if (validReferrer && String(validReferrer._id) !== String(user._id)) {
      try {
        await Referral.create({
          referrer: validReferrer._id,
          referredUser: user._id,
          status: "joined",
        });
      } catch (referralError: any) {
        // Duplicate-key (11000) means this account is already attributed -
        // a safe no-op. Any other failure must not affect the account that
        // was already created successfully above.
        if (referralError?.code !== 11000) {
          console.error("Failed to create referral:", referralError);
        }
      }
    }

    return ok(
      {
        message: "Registration successful",
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
        },
      },
      201
    );
  } catch (error) {
    console.error("POST /api/register error:", error);
    return fail("Registration failed", 500);
  }
}
