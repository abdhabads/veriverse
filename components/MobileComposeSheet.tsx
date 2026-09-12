"use client";

// components/MobileComposeSheet.tsx
// P2.10: the mobile audit found Feed's permanently-expanded inline composer
// consumed the entire first 390x844 screen, leaving zero posts visible
// without scrolling. On mobile, Feed replaces that inline card with a
// compact trigger that opens this on-demand sheet instead - same
// PostComposer, same Feed-owned state, so a draft isn't lost by opening/
// closing it. Modeled directly on ConfirmDialog's native <dialog> pattern
// (fully controlled via `open`, parent decides when to close it) for the
// same free focus-trap/Escape/top-layer behavior, rather than a new
// overlay implementation.
import { useEffect, useId, useRef } from "react";
import PostComposer, { type PublishPhase } from "@/components/PostComposer";

export type MobileComposeSheetProps = {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  publishPhase: PublishPhase;
  busy: boolean;
};

export default function MobileComposeSheet({
  open,
  onClose,
  value,
  onChange,
  onSubmit,
  publishPhase,
  busy,
}: MobileComposeSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const suppressNextCloseRef = useRef(false);
  const titleId = useId();

  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the dialog itself by default; move focus into
      // the actual textarea so typing works immediately.
      dialog.querySelector("textarea")?.focus();
    } else if (!open && dialog.open) {
      // Parent-driven close (e.g. after a successful publish) - not a user
      // dismissal, so the native "close" event below must not double-fire
      // onClose.
      suppressNextCloseRef.current = true;
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      if (suppressNextCloseRef.current) {
        suppressNextCloseRef.current = false;
        return;
      }
      onCloseRef.current();
    };

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className="vv-compose-sheet">
      {/* Rendered only while actually open - the desktop inline composer
          (components/PostComposer.tsx) shares this same placeholder text
          and data-testid, and this <dialog> stays mounted at all times
          (see the effect above) regardless of viewport, so an always-
          rendered copy here would make both ambiguous to every existing
          test/selector that targets the composer, on every page load. */}
      {open && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 id={titleId} className="vv-text-card-title">
              New Post
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close composer"
              className="vv-btn-ghost vv-btn-sm"
            >
              Close
            </button>
          </div>

          <PostComposer
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            publishPhase={publishPhase}
            busy={busy}
          />
        </>
      )}
    </dialog>
  );
}
