"use client";

// components/shell/ProfileMenu.tsx
// Avatar/account menu. On desktop it's a small trigger at the end of the
// persistent top bar; on mobile it IS the "Profile" bottom-nav slot itself
// (tapping it opens this menu rather than navigating directly - Messages
// and every other secondary destination lives here since there's no room
// for them in the 5-item bottom bar). Self-contained: owns its own open
// state, outside-click/Escape handling, and focus return - no external
// controller needed, no menu-library dependency.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { clearAuth } from "@/lib/clientAuth";
import { ShellIcon } from "@/components/Icons";
import NavItem from "./NavItem";
import type { ShellUser } from "@/hooks/useCurrentUser";

export type ProfileMenuProps = {
  user: NonNullable<ShellUser>;
  unreadMessages: number;
  variant: "desktop" | "mobile";
};

export default function ProfileMenu({ user, unreadMessages, variant }: ProfileMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setOpen(false);

    try {
      await api.post("/logout");
    } catch {
      // Same swallow-and-clear-anyway behavior as the original Navbar.
    } finally {
      clearAuth();
      router.push("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  const initial = user.username?.slice(0, 1)?.toUpperCase() || "U";
  const triggerLabel =
    variant === "mobile"
      ? `Profile menu${unreadMessages > 0 ? ", unread messages" : ""}`
      : `Profile menu for ${user.username}`;

  return (
    <div className={variant === "mobile" ? "relative flex-1" : "relative"}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        className={
          variant === "mobile"
            ? "vv-shell-mobile-item vv-focus-ring relative w-full"
            : "vv-shell-avatar vv-focus-ring"
        }
      >
        {variant === "mobile" ? (
          <>
            <ShellIcon name="user" />
            <span aria-hidden="true">Profile</span>
            {unreadMessages > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1 h-2 w-2 rounded-full"
                style={{ backgroundColor: "var(--color-veriverse-accent)" }}
              />
            )}
          </>
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account"
          className={
            variant === "mobile"
              ? "vv-shell-menu-panel absolute bottom-full right-0 mb-2 w-64"
              : "vv-shell-menu-panel absolute right-0 top-full mt-2 w-64"
          }
        >
          <div className="mb-1 border-b border-black/5 px-3 py-2">
            <p className="truncate text-sm font-semibold text-veriverse-dark">{user.username}</p>
          </div>

          {/* P2.10: grouped so Messages (a primary, unread-badge-bearing
              destination) reads as visually distinct from gamification
              items like Leaderboard/Rewards/Referrals - the mobile audit
              found a flat 10-item list gave every destination equal
              weight regardless of how central it is. Groups are headings
              only; every destination, route, and permission gate is
              unchanged. */}
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Social
          </p>
          <NavItem label="Profile" href="/profile" icon={<ShellIcon name="user" />} variant="menu" onClick={closeMenu} />
          {variant === "mobile" && (
            <NavItem
              label="Messages"
              href="/messages"
              matchPaths={["/messages"]}
              icon={<ShellIcon name="mail" />}
              unreadCount={unreadMessages}
              variant="menu"
              onClick={closeMenu}
            />
          )}

          <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Community
          </p>
          <NavItem label="Leaderboard" href="/leaderboard" variant="menu" onClick={closeMenu} />
          <NavItem label="Reputation" href="/reputation" variant="menu" onClick={closeMenu} />
          <NavItem label="Rewards" href="/rewards" variant="menu" onClick={closeMenu} />
          <NavItem label="Referrals" href="/referrals" variant="menu" onClick={closeMenu} />
          <NavItem label="Appeals" href="/appeals" variant="menu" onClick={closeMenu} />

          <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Account
          </p>
          <NavItem label="Safety Controls" href="/safety" variant="menu" onClick={closeMenu} />
          <NavItem label="Account Management" href="/account-management" variant="menu" onClick={closeMenu} />
          {user.role === "admin" && (
            <NavItem label="Admin" href="/admin" matchPaths={["/admin"]} variant="menu" onClick={closeMenu} />
          )}
          {user.role === "expert" && (
            <NavItem label="Expert Review" href="/expert" variant="menu" onClick={closeMenu} />
          )}

          <div className="mt-1 border-t border-black/5 pt-1">
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="vv-shell-menu-item vv-focus-ring w-full text-left"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
