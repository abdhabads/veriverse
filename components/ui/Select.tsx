// components/ui/Select.tsx
// Thin wrapper over the existing .vv-select class - see Input.tsx for the
// same rationale (preserve visuals, fix focus color via the token).
import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref
) {
  return (
    <select ref={ref} className={["vv-select", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </select>
  );
});

export default Select;
