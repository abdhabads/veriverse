"use client";

// components/shell/AppShell.tsx
// Mounted once from app/layout.tsx (a server component) around {children}.
// Presentation only: it never redirects and never gates a route - existing
// page-level requireAuthenticated/requireAdmin/requireExpert calls remain
// the actual authorization mechanism, completely unchanged. Pathname alone
// decides shell-eligibility; the independently-fetched current-user state
// decides which shell variant (authenticated vs public) renders.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { isShellExcludedRoute } from "./routeMatch";
import DesktopNav from "./DesktopNav";
import MobileBottomNav from "./MobileBottomNav";
import PublicShellHeader from "./PublicShellHeader";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const excluded = isShellExcludedRoute(pathname);

  const { user } = useCurrentUser(pathname);
  const { unreadMessages, unreadNotifications } = useUnreadCounts(!excluded && Boolean(user));

  if (excluded) {
    // Landing page keeps components/home/Navbar; login/register/forgot/
    // reset/privacy/terms/onboarding render their own bare markup exactly
    // as before - no application shell at all.
    return <>{children}</>;
  }

  if (!user) {
    return (
      <>
        <PublicShellHeader />
        {children}
      </>
    );
  }

  return (
    <>
      <DesktopNav user={user} unreadMessages={unreadMessages} unreadNotifications={unreadNotifications} />
      {/* Bottom padding only matters below md, where the fixed bottom nav
          would otherwise sit on top of page content. */}
      <div className="pb-20 md:pb-0">{children}</div>
      <MobileBottomNav user={user} unreadMessages={unreadMessages} unreadNotifications={unreadNotifications} />
    </>
  );
}
