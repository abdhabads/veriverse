"use client";

// components/shell/PublicShellHeader.tsx
// Compact header for shell-eligible routes (post detail, public profiles,
// topics) when the visitor is NOT logged in. Deliberately exposes nothing
// beyond Logo / Log in / Sign up - no authenticated-only destination is
// ever reachable from here. Reuses the same .vv-navbar bar as the
// authenticated shell so switching between logged-in/out states doesn't
// jar visually.
//
// P2.7: a "Search" link used to sit here, but /search is (and remains)
// authenticated-only in proxy.ts - clicking it as a logged-out visitor
// silently bounced to /login with no explanation, directly contradicting
// this file's own "no authenticated-only destination reachable" invariant.
// Removing the link (rather than widening auth) was the smaller, more
// conservative fix.
import Link from "next/link";
import Logo from "@/components/Logo";
import { buttonClassName } from "@/components/ui/Button";

export default function PublicShellHeader() {
  return (
    <div className="vv-navbar">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="vv-focus-ring flex shrink-0 items-center gap-1.5 rounded-full">
          <Logo size={26} dark />
          <span className="hidden text-xl font-bold leading-none sm:inline">eriVerse</span>
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
