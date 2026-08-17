type Props = {
  score?: number | null;
  showScore?: boolean; // optionally show the raw number too
};

function getBadgeConfig(score: number | null | undefined): {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
} {
  if (score == null) {
    return {
      label: "Not Evaluated",
      color: "text-gray-500",
      bg: "bg-gray-50",
      border: "border-gray-200",
      icon: "○",
    };
  }
  if (score >= 0.8) {
    return {
      label: "Strong Evidence",
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      icon: "✓",
    };
  }
  if (score >= 0.6) {
    return {
      label: "Supported",
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
      icon: "✓",
    };
  }
  if (score >= 0.3) {
    return {
      label: "Mixed Evidence",
      color: "text-yellow-700",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      icon: "~",
    };
  }
  return {
    label: "Weak Evidence",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "✗",
  };
}

export default function VerificationBadge({ score, showScore = false }: Props) {
  const config = getBadgeConfig(score);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
      title={
        score != null
          ? `Verification score: ${(score * 100).toFixed(0)}%`
          : "Verification score not yet calculated"
      }
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
      {showScore && score != null && (
        <span className="ml-1 opacity-60">
          ({(score * 100).toFixed(0)}%)
        </span>
      )}
    </span>
  );
}
