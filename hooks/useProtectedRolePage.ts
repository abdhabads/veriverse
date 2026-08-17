"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { requireAdmin, requireExpert } from "@/lib/frontendAccess";

type RoleType = "admin" | "expert";

export function useProtectedRolePage(
  role: RoleType,
  onAuthorized: () => Promise<void> | void
) {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const user =
        role === "admin"
          ? await requireAdmin(router)
          : await requireExpert(router);

      if (!mounted || !user) return;
      await onAuthorized();
    }

    boot();

    return () => {
      mounted = false;
    };
  }, [role, router, onAuthorized]);
}