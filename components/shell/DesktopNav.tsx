"use client";

// components/shell/DesktopNav.tsx
// Persistent desktop nav (lg+: icon+label; md-lg: icon-only "tablet
// compact" treatment via CSS, never JS viewport detection - see
// labelClassName usage below). Replaces the old 9-pill flex-wrap Navbar;
// primary destinations only, everything else lives in ProfileMenu.
import Link from "next/link";
import Logo from "@/components/Logo";
import { ShellIcon } from "@/components/Icons";
import { buttonClassName } from "@/components/ui/Button";
import NavItem from "./NavItem";
import ProfileMenu from "./ProfileMenu";
import type { ShellUser } from "@/hooks/useCurrentUser";

export type DesktopNavProps = {
  user: NonNullable<ShellUser>;
  unreadMessages: number;
  unreadNotifications: number;
};

// Visible from lg+ only; hidden (icon-only) between md and lg, the
// intentional tablet-compact state.
const TABLET_HIDDEN_LABEL = "hidden lg:inline";

export default function DesktopNav({ user, unreadMessages, unreadNotifications }: DesktopNavProps) {
  return (
    <div className="vv-navbar hidden md:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/feed" className="vv-focus-ring flex shrink-0 items-center gap-1.5 rounded-full">
          <Logo size={26} dark />
          <span className="hidden text-xl font-bold leading-none lg:inline">eriVerse</span>
        </Link>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          <NavItem
            label="Feed"
            href="/feed"
            icon={<ShellIcon name="home" />}
            labelClassName={TABLET_HIDDEN_LABEL}
          />
          <NavItem
            label="Search"
            href="/search"
            icon={<ShellIcon name="search" />}
            labelClassName={TABLET_HIDDEN_LABEL}
          />
          <NavItem
            label="Messages"
            href="/messages"
            matchPaths={["/messages"]}
            icon={<ShellIcon name="mail" />}
            unreadCount={unreadMessages}
            labelClassName={TABLET_HIDDEN_LABEL}
          />
          <NavItem
            label="Notifications"
            href="/notifications"
            icon={<ShellIcon name="bell" />}
            unreadCount={unreadNotifications}
            labelClassName={TABLET_HIDDEN_LABEL}
          />
          {user.role === "admin" && (
            <NavItem label="Admin" href="/admin" matchPaths={["/admin"]} labelClassName={TABLET_HIDDEN_LABEL} />
          )}
          {user.role === "expert" && (
            <NavItem label="Expert Review" href="/expert" labelClassName={TABLET_HIDDEN_LABEL} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/feed"
            className={buttonClassName({ variant: "accent", size: "sm", className: "gap-1.5" })}
            aria-label="Compose a new post"
          >
            <ShellIcon name="plus" />
            <span className="hidden lg:inline">Compose</span>
          </Link>

          <ProfileMenu user={user} unreadMessages={unreadMessages} variant="desktop" />
        </div>
      </div>
    </div>
  );
}
