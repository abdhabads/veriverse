"use client";

// components/SafetyUserRow.tsx
// P2.9: Safety's blocked/muted rows previously built their own inline
// markup showing raw "Reputation: N" text - the exact anti-pattern P2.7
// already removed from Search's people rows. `UserListItem` (P2.5) was
// considered first, but it's hardcoded to a Follow action and shows the
// same raw reputation text itself, so reusing it here would mean either
// changing its behavior (out of scope for this phase) or displaying a
// Follow control where an Unblock/Unmute action belongs. This is a small,
// independent row: identity (avatar + username, linking to the profile,
// matching the click-to-profile convention every other person row already
// has) plus a single caller-supplied action.
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

type Props = {
  displayName: string;
  avatarUrl?: string;
  // Omit when the target account can't be resolved (e.g. a relation whose
  // target user record no longer populates cleanly) - the row still shows
  // identity/action but isn't a broken link to a nonexistent profile.
  profileHref?: string;
  actionLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onAction: () => void;
};

export default function SafetyUserRow({
  displayName,
  avatarUrl,
  profileHref,
  actionLabel,
  busyLabel = "Working...",
  busy = false,
  onAction,
}: Props) {
  const router = useRouter();

  const identity = (
    <>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full border object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-slate-200 text-xs text-slate-500"
        >
          {displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <p className={`truncate text-sm font-semibold ${profileHref ? "vv-link" : ""}`}>{displayName}</p>
    </>
  );

  return (
    <div className="vv-post-panel flex items-center justify-between gap-3">
      {profileHref ? (
        <button
          type="button"
          onClick={() => router.push(profileHref)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {identity}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
      )}

      <Button variant="secondary" size="sm" onClick={onAction} loading={busy}>
        {busy ? busyLabel : actionLabel}
      </Button>
    </div>
  );
}
