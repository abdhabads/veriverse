// components/ExpertBadge.tsx
//
// P3.6: deliberately its own small component, not a reuse of
// ClaimVerdictBadge/TrustVerdictBadge - those render a computed truth
// verdict about a Claim/Post, and this renders a platform-recognized
// identity fact about a person. Sharing visual/semantic vocabulary between
// the two would blur exactly the line P3.6's governing principle protects
// ("expertise should help users understand who may know a subject - not
// decide what is true"). Domain labels are always shown alongside the
// badge - never a bare "Verified Expert" implying universal authority.
type Props = {
  domains: string[];
  domainLabels: Record<string, string>;
};

export default function ExpertBadge({ domains, domainLabels }: Props) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className="vv-pill-purple"
        title="VeriVerse has recognized this user's expertise in the listed subject area."
      >
        Verified Expert
      </span>
      {domains.map((domain) => (
        <span key={domain} className="vv-pill-gray text-xs">
          {domainLabels[domain] || domain}
        </span>
      ))}
    </span>
  );
}
