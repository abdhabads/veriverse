import TrustIcon, { type TrustIconName } from "@/components/TrustIcons";
import type { TrustTone } from "@/lib/trustPresentation";
import { formatVerificationScore } from "@/lib/formatters";

type Props = {
  score?: number | null;
  showScore?: boolean; // optionally show the raw number too
};

function getBadgeConfig(score: number | null | undefined): {
  label: string;
  tone: TrustTone;
  icon: TrustIconName;
} {
  if (score == null) {
    return { label: "Not Evaluated", tone: "neutral", icon: "circle" };
  }
  if (score >= 0.8) {
    return { label: "Strong Evidence", tone: "positive", icon: "check" };
  }
  if (score >= 0.6) {
    return { label: "Supported", tone: "positive", icon: "check" };
  }
  if (score >= 0.3) {
    return { label: "Mixed Evidence", tone: "review", icon: "alert" };
  }
  return { label: "Weak Evidence", tone: "negative", icon: "x" };
}

export default function VerificationBadge({ score, showScore = false }: Props) {
  const config = getBadgeConfig(score);

  return (
    <span
      className={`vv-verdict-pill vv-verdict-${config.tone}`}
      title={
        score != null
          ? `Verification score: ${formatVerificationScore(score)}`
          : "Verification score not yet calculated"
      }
    >
      <TrustIcon name={config.icon} />
      {config.label}
      {showScore && score != null && (
        <span className="opacity-60">({formatVerificationScore(score)})</span>
      )}
    </span>
  );
}
