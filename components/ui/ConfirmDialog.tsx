// components/ui/ConfirmDialog.tsx
// Replaces window.confirm() with an in-brand, accessible dialog, built on
// the native <dialog> element rather than a hand-rolled <div> overlay -
// showModal()/close() give focus trapping, Escape handling, top-layer
// stacking, and (in evergreen browsers) return of focus to the triggering
// element for free, without adding a dependency.
//
// Contract:
// - Fully controlled via `open`.
// - Escape and the Cancel button both resolve through the dialog's native
//   `close` event -> onCancel fires exactly once, with no other side
//   effect.
// - Confirm never closes the dialog itself; the caller decides when to
//   flip `open` to false (e.g. after a successful delete), so a failed
//   confirm can leave the dialog open. Because of that, closes driven by
//   the `open` prop changing are suppressed from also firing onCancel -
//   otherwise a successful confirm would incorrectly trigger a cancel
//   callback immediately after.
// - `pending` (set while onConfirm's promise is in flight) disables both
//   buttons, so a second click can't invoke onConfirm a second time.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import Button from "./Button";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  const suppressNextCloseRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  onCancelRef.current = onCancel;

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Sync the imperative <dialog> element to the controlled `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      // Parent-driven close (e.g. after a successful confirm) - not a user
      // cancel, so the upcoming native "close" event must not call onCancel.
      suppressNextCloseRef.current = true;
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) setPending(false);
  }, [open]);

  // One listener handles both Escape (browser's default action closes the
  // dialog, then fires "close") and the Cancel button (which calls
  // dialog.close() directly below) - a single code path for "closed
  // without confirming".
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      if (suppressNextCloseRef.current) {
        suppressNextCloseRef.current = false;
        return;
      }
      if (!pendingRef.current) {
        onCancelRef.current();
      }
    };

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  function handleCancelClick() {
    if (pending) return;
    dialogRef.current?.close();
  }

  async function handleConfirmClick() {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="vv-confirm-dialog"
    >
      <h2 id={titleId} className="vv-text-card-title mb-2">
        {title}
      </h2>

      {description && (
        <p id={descriptionId} className="vv-text-body-sm mb-4">
          {description}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-2">
        <Button type="button" variant="secondary" onClick={handleCancelClick} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "danger" : "primary"}
          onClick={handleConfirmClick}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
