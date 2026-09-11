"use client";

// components/shell/NavItem.tsx
// Single shared link+active-state+badge renderer used by DesktopNav,
// MobileBottomNav, and ProfileMenu - the one place isActiveRoute is
// consumed, so no nav surface duplicates its own matching rule.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isAnyRouteActive } from "./routeMatch";
import NavBadge from "./NavBadge";

export type NavItemVariant = "desktop" | "mobile" | "menu";

export type NavItemProps = {
  label: string;
  href: string;
  icon?: ReactNode;
  matchPaths?: string[];
  unreadCount?: number;
  dotOnly?: boolean;
  variant?: NavItemVariant;
  /** Visually hides the text label via CSS only (e.g. "hidden lg:inline" for
   * the tablet-compact desktop nav) while the accessible name (aria-label)
   * always includes it - no JS viewport branching. */
  labelClassName?: string;
  onClick?: () => void;
};

const VARIANT_CLASSES: Record<NavItemVariant, string> = {
  desktop: "vv-btn-nav vv-focus-ring inline-flex items-center gap-2",
  mobile: "vv-shell-mobile-item vv-focus-ring",
  menu: "vv-shell-menu-item vv-focus-ring",
};

export default function NavItem({
  label,
  href,
  icon,
  matchPaths,
  unreadCount = 0,
  dotOnly = false,
  variant = "desktop",
  labelClassName,
  onClick,
}: NavItemProps) {
  const pathname = usePathname();
  const active = isAnyRouteActive(pathname, matchPaths ?? [href]);
  const ariaLabel =
    unreadCount > 0 ? `${label}, ${unreadCount > 99 ? "99+" : unreadCount} unread` : label;

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      className={[
        VARIANT_CLASSES[variant],
        "relative",
        active ? "vv-shell-item-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      <span className={labelClassName}>{label}</span>
      {!dotOnly && <NavBadge count={unreadCount} />}
      {dotOnly && <NavBadge count={unreadCount} dot />}
    </Link>
  );
}
