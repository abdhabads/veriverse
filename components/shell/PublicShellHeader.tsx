"use client";

// components/shell/PublicShellHeader.tsx
// Compact header for shell-eligible routes (search, post detail, public
// profiles, topics) when the visitor is NOT logged in. Deliberately exposes
// nothing beyond Logo / Search / Log in / Sign up - no authenticated-only
// destination is ever reachable from here. Reuses the same .vv-navbar bar
// as the authenticated shell so switching between logged-in/out states
// doesn't jar visually.
import Link from "next/link";
import Logo from "@/components/Logo";
import { ShellIcon } from "@/components/Icons";
import { buttonClassName } from "@/components/ui/Button";

export default function PublicShellHeader() {
  return (
    <div className="vv-navbar">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="vv-focus-ring flex shrink-0 items-center gap-1.5 rounded-full">
          <Logo size={26} dark />
          <span className="hidden text-xl font-bold leading-none sm:inline">eriVerse</span>
        </Link>

        <Link
          href="/search"
          aria-label="Search"
          className="vv-btn-nav vv-focus-ring inline-flex items-center gap-2"
        >
          <ShellIcon name="search" />
          <span className="hidden sm:inline">Search</span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/login" className={buttonClassName({ variant: "secondary", size: "sm" })}>
            Log in
          </Link>
          <Link href="/register" className={buttonClassName({ variant: "accent", size: "sm" })}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
