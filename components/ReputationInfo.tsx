// Explanatory presentation only - keeps the "reputation is not claim truth"
// distinction consistent everywhere reputation is shown, without
// duplicating the copy per-surface. No tooltip library: a native
// <details>/<summary> disclosure is accessible by default and needs no
// new dependency.
export const REPUTATION_EXPLANATION =
  "Reputation reflects past participation on VeriVerse. It does not determine whether a specific claim is true.";

export default function ReputationInfo({
  variant = "compact",
  className = "",
}: {
  variant?: "compact" | "full";
  className?: string;
}) {
  if (variant === "full") {
    return (
      <p className={`text-xs text-slate-500 ${className}`}>{REPUTATION_EXPLANATION}</p>
    );
  }

  return (
    <details className={`text-xs text-slate-500 ${className}`}>
      <summary className="cursor-pointer select-none inline-flex items-center gap-1 hover:text-slate-700">
        <span aria-hidden="true">&#9432;</span>
        <span>What is reputation?</span>
      </summary>
      <p className="mt-1">{REPUTATION_EXPLANATION}</p>
    </details>
  );
}
