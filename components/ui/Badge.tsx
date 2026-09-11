// components/ui/Badge.tsx
// Generic presentation-only pill. Deliberately reuses the existing
// .vv-pill-* classes (54 uses across 17 files) instead of inventing a
// parallel set of colors - this is a thin React wrapper, not a new visual
// language.
//
// This is NOT the trust/verdict badge system. TrustVerdictBadge,
// VerificationBadge, and the .vv-verdict-* / .vv-stance-pill classes stay
// exactly as they are - that consolidation belongs to P2.4, which also
// owns fixing the two known-drifted verdict engines. Badge must not be
// retrofitted underneath them in this phase.
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "vv-pill-gray",
  info: "vv-pill-blue",
  accent: "vv-pill-purple",
  success: "vv-pill-green",
  warning: "vv-pill-yellow",
  danger: "vv-pill-red",
};

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  tone?: BadgeTone;
  children: ReactNode;
};

export default function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  const classes = [TONE_CLASSES[tone], className].filter(Boolean).join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
