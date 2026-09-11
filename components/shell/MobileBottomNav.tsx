"use client";

// components/shell/MobileBottomNav.tsx
// Fixed bottom navigation, exactly 5 slots: Feed, Search, Compose,
// Notifications, Profile (which doubles as the ProfileMenu trigger -
// Messages deliberately does NOT get a 6th slot; it lives inside
// ProfileMenu on mobile, with a subtle unread dot surfaced here instead).
import Link from "next/link";
import { ShellIcon } from "@/components/Icons";
import NavItem from "./NavItem";
import ProfileMenu from "./ProfileMenu";
import type { ShellUser } from "@/hooks/useCurrentUser";

export type MobileBottomNavProps = {
  user: NonNullable<ShellUser>;
  unreadMessages: number;
  unreadNotifications: number;
};

export default function MobileBottomNav({ user, unreadMessages, unreadNotifications }: MobileBottomNavProps) {
  return (
    <nav aria-label="Primary" className="vv-shell-mobile-bar md:hidden">
      <NavItem label="Feed" href="/feed" icon={<ShellIcon name="home" />} variant="mobile" />
      <NavItem label="Search" href="/search" icon={<ShellIcon name="search" />} variant="mobile" />

      <Link
        href="/feed"
        aria-label="Compose a new post"
        className="vv-shell-mobile-item vv-shell-mobile-compose vv-focus-ring"
      >
        <ShellIcon name="plus" />
        <span aria-hidden="true">Compose</span>
      </Link>

      <NavItem
        label="Notifications"
        href="/notifications"
        icon={<ShellIcon name="bell" />}
        unreadCount={unreadNotifications}
        variant="mobile"
      />

      <ProfileMenu user={user} unreadMessages={unreadMessages} variant="mobile" />
    </nav>
  );
}
