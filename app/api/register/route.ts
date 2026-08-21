import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { verifyCaptchaToken } from "@/lib/captcha";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanString, isStrongEnoughPassword, isValidEmail } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";

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

    if (!username || !email || !password) {
      return fail("Username, email, and password are required.", 400);
    }

    if (!isValidEmail(email)) {
      return fail("Please enter a valid email address.", 400);
    }

    if (!isStrongEnoughPassword(password)) {
      return fail("Password must be at least 8 characters.", 400);
    }

    const captchaCheck = await verifyCaptchaToken(captchaToken);
    if (!captchaCheck.success) {
      return fail(captchaCheck.message || "Captcha verification failed", 400);
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return fail("A user with that email or username already exists.", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "user",
    });

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
