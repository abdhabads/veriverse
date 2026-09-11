// components/ui/Field.tsx
// Thin layout wrapper: label + control association + optional helper/error
// text with correct aria-describedby wiring. Not a form framework - no
// validation, no schema, no submit handling. The render-prop shape keeps
// id/aria-describedby wiring explicit and type-safe without React.
// cloneElement fragility.
//
// There is no existing per-field error convention in this codebase today
// (confirmed: no aria-invalid/field-error usage anywhere) - all current
// validation feedback goes through the shared page-level Alert/Toast
// banner. The `error` slot below exists so a control CAN opt into inline
// errors later; nothing in this phase requires or assumes it will.
"use client";

import { useId } from "react";
import type { ReactNode } from "react";

export type FieldRenderProps = {
  id: string;
  "aria-describedby"?: string;
};

export type FieldProps = {
  label: string;
  htmlFor?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (fieldProps: FieldRenderProps) => ReactNode;
};

export default function Field({
  label,
  htmlFor,
  helperText,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const id = htmlFor || generatedId;
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="vv-label block mb-1">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {children({ id, "aria-describedby": describedBy })}

      {error ? (
        <p id={errorId} className="vv-text-meta mt-1" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="vv-text-meta mt-1">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
