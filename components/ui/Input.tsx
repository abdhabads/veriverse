// components/ui/Input.tsx
// Thin wrapper over the existing .vv-input class - preserves current
// visual behavior exactly; focus color now comes from --color-focus-ring
// via the (updated) .vv-input:focus rule in globals.css rather than the
// overloaded accent orange.
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={["vv-input", className].filter(Boolean).join(" ")} {...rest} />;
});

export default Input;
