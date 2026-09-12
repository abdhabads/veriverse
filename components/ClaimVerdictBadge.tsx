// components/ClaimVerdictBadge.tsx
//
// Visually belongs to the same design system as TrustVerdictBadge (same
// vv-verdict-pill/vv-verdict-{tone} classes, same TrustIcon set) but is a
// separate component on purpose: a Claim's assessmentBand and a Post's
// status are different semantic vocabularies (see lib/claimPresentation.ts),
// and TrustVerdictBadge's whole job is deriving a verdict from the Post
// vocabulary via getTrustVerdict(). Branching that component on two
// incompatible input shapes would make it harder to reason about, not
// clearer. This component contains no trust logic of its own - it only
// renders an already-computed ClaimVerdictPresentation.
import type { ClaimVerdictPresentation } from "@/lib/claimPresentation";
import TrustIcon from "@/components/TrustIcons";

type Props = {
  verdict: ClaimVerdictPresentation;
  detail?: string;
};

export default function ClaimVerdictBadge({ verdict, detail }: Props) {
  return (
    <span
      className={`vv-verdict-pill vv-verdict-${verdict.tone}`}
      title={detail ?? `Claim assessment: ${verdict.label}`}
    >
      <TrustIcon name={verdict.icon} />
      <span>{verdict.label}</span>
    </span>
  );
}
