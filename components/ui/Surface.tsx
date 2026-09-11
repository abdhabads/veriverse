// components/ui/Surface.tsx
// Generic card shell covering the three real visual intents found in the
// audit (neutral card, quiet/translucent card, warm-accent card) by
// reusing the existing .vv-card / .vv-card-soft / .vv-post-panel-accent
// classes - not a replacement for the other ~8 bespoke card classes
// (.vv-hero, .vv-admin-*, .vv-stat-card, etc.), which stay page-specific
// until their owning phases touch them.
import type { HTMLAttributes, ReactNode } from "react";

export type SurfaceTone = "default" | "soft" | "accent";

const TONE_CLASSES: Record<SurfaceTone, string> = {
  default: "vv-card",
  soft: "vv-card-soft",
  accent: "vv-post-panel-accent",
};

export type SurfaceProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  tone?: SurfaceTone;
  children?: ReactNode;
};

export default function Surface({ tone = "default", className, children, ...rest }: SurfaceProps) {
  return (
    <div className={[TONE_CLASSES[tone], className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
