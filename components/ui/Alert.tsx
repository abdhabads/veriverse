// components/ui/Alert.tsx
// Functional baseline is the pre-existing components/Toast.tsx (a single
// inline banner keyed off usePageState's message/messageType - not a
// stacking/portal toast, and this deliberately isn't building one; no
// observed need for it). Toast.tsx now delegates to this component so
// every existing consumer gets token-aligned colors and correct
// role/aria-live for free with zero call-site changes.
import type { ReactNode } from "react";

export type AlertType = "success" | "error" | "info";

const TYPE_CLASSES: Record<AlertType, string> = {
  success: "vv-alert-success",
  error: "vv-alert-error",
  info: "vv-alert-info",
};

export type AlertProps = {
  message: ReactNode;
  type?: AlertType;
};

export default function Alert({ message, type = "info" }: AlertProps) {
  const isError = type === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={["vv-alert", TYPE_CLASSES[type]].join(" ")}
    >
      {message}
    </div>
  );
}
