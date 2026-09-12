"use client";

// components/AccountSettingsNav.tsx
// P2.9: Profile, Account & Security, and Safety were three separate routes
// cross-linked only through the shell's ProfileMenu overflow - there was no
// way to move between them directly. This is real page navigation between
// distinct routes (not a single-page tabpanel), so it uses <Link> +
// aria-current="page" rather than role="tab"/aria-selected, while reusing
// the segmented-pill visual language already established for Feed's
// Discovery/Following switcher.
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/profile", label: "Profile" },
  { href: "/account-management", label: "Account & Security" },
  { href: "/safety", label: "Safety" },
];

export default function AccountSettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Account settings sections"
      className="mb-6 flex w-fit flex-wrap gap-2 rounded-full border border-veriverse-border bg-white/60 p-1"
    >
      {SECTIONS.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`vv-focus-ring rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-veriverse-dark text-white"
                : "text-veriverse-dark/60 hover:text-veriverse-dark"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
