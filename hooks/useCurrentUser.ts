"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

export type ShellRole = "user" | "admin" | "expert";

export type ShellUser = {
  username: string;
  role: ShellRole;
} | null;

// Single shell-level source of truth for "who is logged in" - reads the
// same cookie-backed /api/access endpoint every requireAuthenticated() call
// already uses, never localStorage. Presentation only: it never redirects
// and never gates a route - existing page-level requireAuthenticated/
// requireAdmin/requireExpert calls remain the actual authorization
// mechanism, unchanged.
//
// AppShell is mounted once in the persistent root layout and deliberately
// never remounts across client-side navigation - that's the whole point of
// a persistent shell. But it means a one-shot fetch-on-mount would go stale
// the moment login/logout happens via router.push (a soft navigation, not a
// full page load): the old per-page Navbar got this "for free" only because
// it lived inside each page and was remounted by every navigation. Passing
// the current pathname back in as `routeKey` re-runs the check on every
// route change instead, so the shell self-heals within one navigation after
// login or logout without needing a full refresh.
export function useCurrentUser(routeKey: string) {
  const [user, setUser] = useState<ShellUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api
      .get("/access")
      .then((res) => {
        if (!active) return;
        const responseUser = res.data?.user;
        setUser(
          responseUser
            ? { username: responseUser.username, role: (responseUser.role || "user") as ShellRole }
            : null
        );
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  return { user, loading };
}
