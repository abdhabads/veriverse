// Centralizes source-quality classification so OpenAI-path and Tavily-path
// grounding never invent their own, independently-drifting notion of what
// makes a source authoritative (the original bug this sprint's design doc
// flagged: source-quality logic buried separately in each provider).
//
// IMPORTANT: authorityScore below is a coarse, hand-picked heuristic tier,
// not a scientifically validated measure of trustworthiness. It exists so
// downstream code has *something* explainable to reason about ("this is a
// government source" -> 0.9) rather than nothing. Do not present it to users
// as a precision score, and do not tune these numbers against the Sprint 1
// benchmark - the benchmark's job is to measure whether the categories and
// rough ordering hold up, not to be curve-fit against.

export type SourceType =
  | "government"
  | "academic"
  | "institutional"
  | "journalistic"
  | "user_generated"
  | "unknown";

export type SourceAuthorityAssessment = {
  sourceType: SourceType;
  authorityScore: number; // 0-1, heuristic - see file header
  isHeuristic: true;
  reason: string;
};

// Coarse tiers. Deliberately not fine-grained per-domain scores: that would
// imply a precision this heuristic doesn't have.
const AUTHORITY_BY_SOURCE_TYPE: Record<SourceType, number> = {
  government: 0.9,
  academic: 0.9,
  institutional: 0.7,
  journalistic: 0.6,
  user_generated: 0.2,
  unknown: 0.35,
};

// Government / official bodies, including well-known intergovernmental TLD-less
// domains that don't end in .gov but function the same way.
const GOVERNMENT_TLD_PATTERN = /\.(gov|mil)(\.[a-z]{2})?$/i;
// "gov.uk" itself (not a subdomain of it, e.g. "hmrc.gov.uk") does not
// match GOVERNMENT_TLD_PATTERN above - the pattern requires a preceding
// dot before "gov" (i.e. a subdomain), which the bare registrable domain
// doesn't have. Found via Sprint 5.5's authority diagnostic
// (tests/benchmark/vvb-mini/sprint5.5-diagnostic-report.md, section 1).
const GOVERNMENT_DOMAINS = new Set(["europa.eu", "gov.uk"]);

// Academic institutions and major peer-reviewed / clinical publishers.
const ACADEMIC_TLD_PATTERN = /\.(edu|ac)(\.[a-z]{2})?$/i;
const ACADEMIC_DOMAINS = new Set([
  "nature.com",
  "sciencedirect.com",
  "ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "jamanetwork.com",
  "thelancet.com",
  "nejm.org",
  "bmj.com",
  "springer.com",
  "onlinelibrary.wiley.com",
  "pnas.org",
  // Added via Sprint 5.5's authority diagnostic: the American Diabetes
  // Association's own peer-reviewed journal publisher, same tier as the
  // other medical-journal publishers already listed above.
  "diabetesjournals.org",
]);

// Intergovernmental orgs, major standards bodies, professional/medical
// associations, and general reference works - "official" in a broader sense
// than a single national government, and more curated than ordinary UGC.
const INSTITUTIONAL_DOMAINS = new Set([
  "who.int",
  "un.org",
  "unicef.org",
  "redcross.org",
  "cdc.gov", // also matches GOVERNMENT_TLD_PATTERN; kept here as a no-op safety net
  "nih.gov",
  "wikipedia.org",
  "mayoclinic.org",
  "clevelandclinic.org",
  "cochrane.org",
  // Added via Sprint 5.5's authority diagnostic: major professional
  // medical associations at the same "official, curated, non-commercial"
  // tier as WHO/Mayo Clinic/Cleveland Clinic above, found under-classified
  // as "unknown" (0.35) on real evidence in the Sprint 5 corpus.
  "diabetes.org",
  "heart.org",
  "aad.org",
  "orthoinfo.org",
  "vascular.org",
]);

// Well-known journalistic/editorial outlets. Deliberately a curated list,
// not a "looks like a news site" heuristic - guessing from domain shape
// alone (e.g. "contains 'news'") produces too many false positives from
// content-farm and misinformation sites that would otherwise inherit
// journalistic-tier authority.
const JOURNALISTIC_DOMAINS = new Set([
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "npr.org",
  "nytimes.com",
  "washingtonpost.com",
  "theguardian.com",
  "wsj.com",
  "aljazeera.com",
  "afp.com",
  "bloomberg.com",
  "economist.com",
  "premiumtimesng.com",
  "channelstv.com",
  "thecable.ng",
  // Added via Sprint 5.5's authority diagnostic: mainstream outlets
  // comparable in stature to others already listed above (Time to NYT/
  // WaPo, The Atlantic and Scientific American to The Economist,
  // ThisDay to the other already-curated Nigerian outlets).
  "time.com",
  "theatlantic.com",
  "scientificamerican.com",
  "thisdaylive.com",
]);

const USER_GENERATED_DOMAINS = new Set([
  "reddit.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "quora.com",
  "medium.com",
  "youtube.com",
  "blogspot.com",
  "substack.com",
]);

function matchesDomainOrSuffix(domain: string, set: Set<string>): boolean {
  if (set.has(domain)) return true;
  for (const known of set) {
    if (domain.endsWith(`.${known}`)) return true;
  }
  return false;
}

export function classifySourceType(domain: string): SourceType {
  const normalized = (domain || "").toLowerCase().trim();
  if (!normalized) return "unknown";

  if (
    GOVERNMENT_TLD_PATTERN.test(normalized) ||
    matchesDomainOrSuffix(normalized, GOVERNMENT_DOMAINS)
  ) {
    return "government";
  }

  if (
    ACADEMIC_TLD_PATTERN.test(normalized) ||
    matchesDomainOrSuffix(normalized, ACADEMIC_DOMAINS)
  ) {
    return "academic";
  }

  if (matchesDomainOrSuffix(normalized, INSTITUTIONAL_DOMAINS)) {
    return "institutional";
  }

  if (matchesDomainOrSuffix(normalized, JOURNALISTIC_DOMAINS)) {
    return "journalistic";
  }

  if (matchesDomainOrSuffix(normalized, USER_GENERATED_DOMAINS)) {
    return "user_generated";
  }

  return "unknown";
}

export function assessSourceAuthority(domain: string): SourceAuthorityAssessment {
  const sourceType = classifySourceType(domain);
  return {
    sourceType,
    authorityScore: AUTHORITY_BY_SOURCE_TYPE[sourceType],
    isHeuristic: true,
    reason: `Classified as "${sourceType}" from domain pattern matching (heuristic, unvalidated).`,
  };
}
