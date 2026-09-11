// components/VerificationBadge.tsx
// P2.4: repurposed from an independent verdict engine into a purely
// secondary "Evidence strength" signal. It previously computed its own
// label/tone from a private 0.8/0.6/0.3 threshold table and ignored
// expertDecision/contradictionCount entirely - so it could show "Strong
// Evidence" in a positive color next to a canonical "Expert Rejected" or
// "Contradicted" verdict for the exact same post (the P2.4 audit's central
// finding). It now takes the same inputs as TrustVerdictBadge, derives its
// presentation from getEvidenceStrength() in the shared presentation layer
// (same 0.8/0.6 bands as the canonical verdict, not a second table), and
// renders nothing at all whenever the canonical verdict wasn't decided by
// the score - so it can never again visually compete with the verdict.
import TrustIcon from "@/components/TrustIcons";
import { getEvidenceStrength, getTrustVerdict, type TrustVerdictInput } from "@/lib/trustPresentation";

type Props = TrustVerdictInput & {
  // Whether to also show the raw numeric score alongside the categorical
  // label. Shown as a plain decimal ("score 0.82"), never a percent sign -
  // a percent reads too easily as "82% likely true", which this is not.
  showScore?: boolean;
};

export default function VerificationBadge({ showScore = false, ...verdictInput }: Props) {
  const verdict = getTrustVerdict(verdictInput);
  const strength = getEvidenceStrength(verdict, verdictInput.verificationScore);

  if (!strength.visible) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Evidence strength:</span>
      <span
        className={`vv-verdict-pill vv-verdict-${strength.tone}`}
        title={`Evidence strength describes how much supporting evidence is available - it is not a probability that the claim is true.${
          showScore ? ` Score: ${strength.score.toFixed(2)}` : ""
        }`}
      >
        <TrustIcon name={strength.icon} />
        {strength.label}
        {showScore && <span className="opacity-60">(score {strength.score.toFixed(2)})</span>}
      </span>
    </div>
  );
}
