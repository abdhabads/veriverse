// components/shell/NavBadge.tsx
// Small, shell-specific unread-count indicator. Not built on the generic
// components/ui/Badge primitive - Badge's tones map onto the existing
// .vv-pill-* text-pill language, which is a different visual job from a
// numeric counter dot on a nav item; forcing Badge to do this would misuse
// it rather than reuse it.
//
// Purely presentational and aria-hidden - the accessible unread count is
// composed into the parent NavItem's own aria-label, so screen-reader users
// get "Notifications, 3 unread" once, not a redundant separate announcement.
export type NavBadgeProps = {
  count: number;
  dot?: boolean;
};

export default function NavBadge({ count, dot = false }: NavBadgeProps) {
  if (count <= 0) return null;

  if (dot) {
    return (
      <span
        aria-hidden="true"
        className="absolute right-1.5 top-1 h-2 w-2 rounded-full"
        style={{ backgroundColor: "var(--color-veriverse-accent)" }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
      style={{ backgroundColor: "var(--color-veriverse-accent)" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
