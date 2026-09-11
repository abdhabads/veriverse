// components/Toast.tsx
// Thin compatibility wrapper - the real implementation is now
// components/ui/Alert.tsx (token-aligned colors, correct role/aria-live).
// Kept with its exact original prop shape so the ~20+ existing
// `import Toast from "@/components/Toast"` call sites don't need to
// change in this phase; that migration is left to each surface's own
// owning P2 phase.
import Alert, { type AlertType } from "@/components/ui/Alert";

export default function Toast({
  message,
  type = "info",
}: {
  message: string;
  type?: AlertType;
}) {
  return <Alert message={message} type={type} />;
}
