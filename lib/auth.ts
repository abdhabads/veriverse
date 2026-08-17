import jwt from "jsonwebtoken";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";

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
