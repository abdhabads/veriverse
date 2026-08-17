import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

type TokenPayload = {
  id: string;
};

const USER_PROTECTED_PATHS = [
  "/feed",
  "/onboarding",
  "/profile",
  "/notifications",
  "/rewards",
  "/reputation",
  "/saved",
  "/search",
  "/appeals",
  "/safety",
];

const ADMIN_PROTECTED_PATHS = ["/admin"];

const EXPERT_PROTECTED_PATHS = ["/expert"];

const AUTH_PAGES = ["/login", "/register"];

async function getTokenPayload(req: NextRequest): Promise<TokenPayload | null> {
  const token = req.cookies.get("veriverse_token")?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

function pathMatches(pathname: string, protectedPaths: string[]) {
  return protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const tokenPayload = await getTokenPayload(req);
  const isAuthenticated = !!tokenPayload;

  const isUserProtected = pathMatches(pathname, USER_PROTECTED_PATHS);
  const isAdminProtected = pathMatches(pathname, ADMIN_PROTECTED_PATHS);
  const isExpertProtected = pathMatches(pathname, EXPERT_PROTECTED_PATHS);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if ((isUserProtected || isAdminProtected || isExpertProtected) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/feed", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/feed/:path*",
    "/onboarding/:path*",
    "/profile/:path*",
    "/notifications/:path*",
    "/rewards/:path*",
    "/reputation/:path*",
    "/saved/:path*",
    "/search/:path*",
    "/appeals/:path*",
    "/safety/:path*",
    "/admin/:path*",
    "/expert/:path*",
    "/login",
    "/register",
  ],
};
