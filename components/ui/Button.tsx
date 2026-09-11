// components/ui/Button.tsx
// P2.1 design-system primitive. Wraps the existing .vv-btn-* classes
// (already used ~180 times across the app) rather than inventing a new
// visual language - see docs/audit history for why evolutionary
// consolidation was chosen over a CSS rewrite.
"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "vv-btn-primary",
  accent: "vv-btn-accent",
  secondary: "vv-btn-secondary",
  danger: "vv-btn-danger",
  ghost: "vv-btn-ghost",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "",
  sm: "vv-btn-sm",
};

// Pure and exported so button disabled/busy semantics are testable without
// rendering a component - matches this repo's existing convention of
// testing exported logic functions (e.g. GroundedEvidencePanel's
// getEvidenceSummary) rather than mounting React trees.
export function resolveButtonState({
  disabled,
  loading,
}: {
  disabled?: boolean;
  loading?: boolean;
}): { disabled: boolean; ariaBusy: boolean } {
  return {
    disabled: Boolean(disabled) || Boolean(loading),
    ariaBusy: Boolean(loading),
  };
}

// Exported so a <Link> can share exact Button styling without the
// primitive needing to know about routing (no asChild/composition API -
// this codebase has no precedent for one and doesn't need it).
export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return [
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    "vv-focus-ring",
    fullWidth ? "w-full" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth,
    disabled,
    className,
    type = "button",
    children,
    ...rest
  },
  ref
) {
  const state = resolveButtonState({ disabled, loading });

  return (
    <button
      ref={ref}
      type={type}
      disabled={state.disabled}
      aria-busy={state.ariaBusy}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="mr-2 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
        />
      )}
      {children}
    </button>
  );
});

export default Button;
