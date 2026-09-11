// components/CommentActions.tsx
// P2.6: a small accessible overflow for Edit/Delete on an own/admin
// comment, so those two controls stop sitting at equal visual weight next
// to Reply. Modeled on the same interaction pattern already established by
// PostCard's local PostOverflowMenu and components/ProfileSafetyMenu -
// kept as its own small, independent implementation rather than shared,
// matching that existing precedent of each domain owning its own overflow.
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
};

export default function CommentActions({ label, onEdit, onDelete }: Props) {
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
        className="vv-btn-secondary text-xs px-2 py-1"
      >
        <span aria-hidden="true">&#8943;</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          className="vv-post-menu-panel absolute right-0 top-full z-10 mt-2 w-36"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="vv-post-menu-item w-full"
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="vv-post-menu-item vv-post-menu-item-danger w-full"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
