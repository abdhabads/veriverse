"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { clearAuth } from "@/lib/clientAuth";

type Role = "user" | "admin" | "expert" | null;

export default function Navbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const run = async () => {
      try {
        const [userRes, notificationsRes] = await Promise.all([
          api.get("/me"),
          api.get("/notifications"),
        ]);

        setRole(userRes.data.user?.role || "user");
        setUnreadNotifications(Number(notificationsRes.data?.unreadCount || 0));
      } catch {
        setRole("user");
        setUnreadNotifications(0);
      }
    };

    void run();
  }, []);

  const primaryLinks = [
    { label: "Feed", path: "/feed" },
    { label: "Profile", path: "/profile" },
  ];

  const secondaryLinks = [
    { label: "Notifications", path: "/notifications" },
  ];

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const logout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setOpen(false);

    try {
      await api.post("/logout");
    } catch {
    } finally {
      clearAuth();
      router.push("/login");
      router.refresh();
      setLoggingOut(false);
    }
  };

  return (
    <div className="vv-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="cursor-pointer" onClick={() => go("/feed")}>
            <p className="vv-eyebrow mb-2">Truth Graph Network</p>
            <h1 className="text-xl sm:text-2xl font-bold leading-none">VeriVerse</h1>
            <p className="text-[11px] sm:text-xs text-orange-100/80 mt-1">
              Verify signals. Track trust. Escalate what matters.
            </p>
          </div>

          <button
            onClick={() => setOpen((prev) => !prev)}
            className="vv-btn-nav sm:hidden"
          >
            Menu
          </button>

          <div className="hidden sm:flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-2 backdrop-blur-md">
            {primaryLinks.map((link) => (
              <button key={link.path} onClick={() => go(link.path)} className="vv-btn-nav">
                {link.label}
              </button>
            ))}
            {role === "admin" && (
              <button onClick={() => go("/admin")} className="vv-btn-nav">
                Admin
              </button>
            )}
            {secondaryLinks.map((link) => (
              <button key={link.path} onClick={() => go(link.path)} className="vv-btn-nav">
                {link.label}
                {link.path === "/notifications" && unreadNotifications > 0 ? (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-veriverse-purple px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                ) : null}
              </button>
            ))}
            {role === "expert" && (
              <button onClick={() => go("/expert")} className="vv-btn-nav">
                Expert Review
              </button>
            )}
            <button onClick={logout} className="vv-btn-nav" disabled={loggingOut}>
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>

        {open && (
          <div className="sm:hidden mt-4 grid grid-cols-2 gap-2 rounded-[28px] border border-white/10 bg-white/6 p-3 backdrop-blur-md">
            {primaryLinks.map((link) => (
              <button key={link.path} onClick={() => go(link.path)} className="vv-btn-nav">
                {link.label}
              </button>
            ))}
            {role === "admin" && (
              <button onClick={() => go("/admin")} className="vv-btn-nav">
                Admin
              </button>
            )}
            {secondaryLinks.map((link) => (
              <button key={link.path} onClick={() => go(link.path)} className="vv-btn-nav">
                {link.label}
                {link.path === "/notifications" && unreadNotifications > 0 ? (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-veriverse-purple px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                ) : null}
              </button>
            ))}
            {role === "expert" && (
              <button onClick={() => go("/expert")} className="vv-btn-nav">
                Expert Review
              </button>
            )}
            <button onClick={logout} className="vv-btn-nav" disabled={loggingOut}>
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
