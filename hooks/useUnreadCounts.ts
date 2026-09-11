"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

// Matches the polling cadence app/notifications/page.tsx and
// app/messages/page.tsx already use independently - the shell is not more
// aggressive than existing behavior.
const POLL_INTERVAL_MS = 30_000;

// Single shell-level poll of the two existing list endpoints, trusting
// their own unreadCount field exactly as returned (same bounded semantics
// already documented on those routes - not touched here). Owned once by
// AppShell and passed down as props, so DesktopNav/MobileBottomNav/
// ProfileMenu never issue their own duplicate requests.
export function useUnreadCounts(enabled: boolean) {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setUnreadMessages(0);
      setUnreadNotifications(0);
      return;
    }

    let active = true;

    async function load() {
      try {
        const [notificationsRes, messagesRes] = await Promise.all([
          api.get("/notifications"),
          api.get("/messages/conversations"),
        ]);
        if (!active) return;
        setUnreadNotifications(Number(notificationsRes.data?.unreadCount || 0));
        setUnreadMessages(Number(messagesRes.data?.unreadCount || 0));
      } catch {
        if (active) {
          setUnreadNotifications(0);
          setUnreadMessages(0);
        }
      }
    }

    void load();
    const interval = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled]);

  return { unreadMessages, unreadNotifications };
}
