// components/ui/Textarea.tsx
// Thin wrapper over the existing .vv-textarea class - see Input.tsx for
// the same rationale (preserve visuals, fix focus color via the token).
import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref
) {
  return (
    <textarea ref={ref} className={["vv-textarea", className].filter(Boolean).join(" ")} {...rest} />
  );
});

export default Textarea;
