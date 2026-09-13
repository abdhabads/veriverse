// lib/expertiseDomains.ts
//
// P3.6: expertise domains intentionally reuse Claim's own `domain`
// vocabulary (models/Claim.ts) rather than introducing a second,
// incompatible taxonomy. This is the single source of truth both
// models/User.ts (schema enum) and the admin expertise-assignment action
// validate against, so the two can never drift from each other or from
// Claim's own domain values.
export const EXPERTISE_DOMAINS = [
  "medical",
  "political",
  "economic",
  "scientific",
  "general",
] as const;

export type ExpertiseDomain = (typeof EXPERTISE_DOMAINS)[number];

export function isExpertiseDomain(value: unknown): value is ExpertiseDomain {
  return typeof value === "string" && (EXPERTISE_DOMAINS as readonly string[]).includes(value);
}

export const EXPERTISE_DOMAIN_LABELS: Record<ExpertiseDomain, string> = {
  medical: "Medicine",
  political: "Politics",
  economic: "Economics",
  scientific: "Science",
  general: "General",
};
