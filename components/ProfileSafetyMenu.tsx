// components/ProfileSafetyMenu.tsx
// P2.5: a small accessible overflow for Block/Mute, modeled directly on the
// interaction pattern already established by PostCard's local
// PostOverflowMenu and components/shell/ProfileMenu (aria-haspopup/expanded,
// outside-click close, Escape close + focus return) - not imported from
// either, since both are intentionally self-contained to their own domain.
// This exists so Block no longer sits as a top-level, equally-weighted
// danger-red button next to Follow/Message in the profile header.
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  children: React.ReactNode;
};

export default function ProfileSafetyMenu({ label, children }: Props) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="vv-btn-secondary vv-focus-ring"
      >
        <span aria-hidden="true">&#8943;</span>
        <span className="ml-1">More</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          className="vv-post-menu-panel absolute right-0 top-full z-10 mt-2 w-56"
        >
          {children}
        </div>
      )}
    </div>
  );
}
