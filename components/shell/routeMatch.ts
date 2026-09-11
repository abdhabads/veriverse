// components/shell/routeMatch.ts
// Pure route-matching logic shared by every nav surface (desktop, tablet,
// mobile bottom nav, ProfileMenu) so "is this item active" has exactly one
// implementation instead of being duplicated per variant.

export function isActiveRoute(pathname: string, matchPath: string): boolean {
  if (matchPath === "/") return pathname === "/";
  return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
}

export function isAnyRouteActive(pathname: string, matchPaths: string[]): boolean {
  return matchPaths.some((path) => isActiveRoute(pathname, path));
}

// Routes that must never receive the application shell at all - they render
// their own bare markup exactly as before (pre-auth flows, legal pages, the
// marketing landing page which keeps components/home/Navbar, and onboarding
// which must show no normal application shell per product decision).
const SHELL_EXCLUDED_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/onboarding",
];

export function isShellExcludedRoute(pathname: string): boolean {
  return SHELL_EXCLUDED_ROUTES.some((route) => isActiveRoute(pathname, route));
}
