import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";
import { fail } from "@/lib/apiResponse";

export type AuthTokenPayload = {
  id: string;
};

function extractTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((item) => item.trim());

  for (const cookie of cookies) {
    if (cookie.startsWith("veriverse_token=")) {
      return decodeURIComponent(cookie.replace("veriverse_token=", ""));
    }
  }

  return null;
}

export function getUserIdFromRequest(req: Request): string | null {
  let token: string | null = null;

  const cookieHeader = req.headers.get("cookie");
  token = extractTokenFromCookieHeader(cookieHeader);

  if (!token) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as AuthTokenPayload;

    return decoded.id;
  } catch {
    return null;
  }
}

export async function getUserFromRequest(req: Request) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;

  await connectDB();
  const user = await User.findById(userId);
  return user;
}

// Acting-user authorization for mutation routes: authenticates via the same
// JWT-verify + fresh-DB-fetch path as getUserFromRequest (no second token
// decode, no second User query), then rejects a currently-banned,
// currently-suspended, or deactivated actor. "Warned" accounts and accounts
// whose suspension has expired (suspendedUntil <= now, even if
// moderationStatus still reads "suspended" in MongoDB because nothing has
// lazily normalized it yet) are treated as active. This is a read-only
// check - it never writes to the User document; only login and /api/access
// perform that lazy normalization, intentionally.
export async function requireActiveUser(req: Request): Promise<
  | { user: NonNullable<Awaited<ReturnType<typeof getUserFromRequest>>>; errorResponse?: undefined }
  | { user?: undefined; errorResponse: NextResponse }
> {
  const user = await getUserFromRequest(req);

  if (!user) {
    return { errorResponse: fail("Unauthorized", 401) };
  }

  if (user.isDeactivated) {
    return {
      errorResponse: fail(
        "This account has been deactivated. You can restore it from the login page.",
        403
      ),
    };
  }

  if (user.moderationStatus === "banned") {
    return { errorResponse: fail("This account has been banned.", 403) };
  }

  if (
    user.moderationStatus === "suspended" &&
    user.suspendedUntil &&
    new Date(user.suspendedUntil) > new Date()
  ) {
    return {
      errorResponse: fail(
        `This account is suspended until ${new Date(user.suspendedUntil).toLocaleString()}.`,
        403
      ),
    };
  }

  return { user };
}
