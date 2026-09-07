import crypto from "crypto";

// Deterministic claim identity/normalization. Deliberately NOT an LLM call -
// Phase 3's instruction is explicit that an LLM must not be the authoritative
// claim-ID generator, and this needs to be reproducible and race-safe (see
// lib/claimIdentity.ts).
//
// KNOWN LIMITATION, stated up front rather than discovered later: this is
// bag-of-words / surface-pattern matching, not semantic understanding. It
// can recognize trivial wording differences (articles, casing, punctuation,
// word order with identical content words) but cannot distinguish a claim
// from its negation ("X causes Y" vs "X does not cause Y" share almost all
// their significant tokens). That's why only "exact"/"high_confidence" ever
// auto-merge, and "possible" never does - a negated claim landing in
// "possible" is safe (nothing gets wrongly merged) even though it isn't a
// correct "these are opposites" classification. Fixing that needs real
// semantic comparison, deliberately out of scope here.

export type TemporalScope = {
  type: "unspecified" | "relative" | "specific";
  value: string | null;
};

export type ClaimType = "statistical" | "comparative" | "causal" | "existential";
export type ClaimDomain = "medical" | "political" | "economic" | "scientific" | "general";

export type ClaimIdentity = {
  canonicalText: string;
  normalizedText: string;
  identityKey: string;
  claimType: ClaimType;
  domain: ClaimDomain;
  jurisdiction: string | null;
  temporalScope: TemporalScope;
};

export type ClaimMatchTier = "exact" | "high_confidence" | "possible" | "no_match";

const LEADING_FILLER = /^(the|a|an)\s+/i;
const TRAILING_FILLER =
  /\s*(,?\s*(right|isn'?t it|don'?t you think|correct)\s*\??\s*)$/i;
const STRIPPABLE_PUNCTUATION = /[.,!?;:"'()[\]{}]/g;

export function normalizeClaimText(rawText: string): string {
  let text = rawText.trim();
  text = text.replace(TRAILING_FILLER, "");
  text = text.replace(LEADING_FILLER, "");
  text = text.toLowerCase();
  text = text.replace(STRIPPABLE_PUNCTUATION, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

const MONTH_NAMES =
  "january|february|march|april|may|june|july|august|september|october|november|december";
const MONTH_YEAR_PATTERN = new RegExp(
  `\\b(${MONTH_NAMES})\\s+(\\d{4})\\b`,
  "i"
);
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;
const RELATIVE_TEMPORAL_MARKERS = [
  "currently",
  "right now",
  "as of today",
  "as of now",
  "today",
  "this year",
  "this month",
  "at present",
];

const MONTH_ORDER = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function monthToNumber(month: string): string {
  const index = MONTH_ORDER.indexOf(month.toLowerCase());
  return String(index + 1).padStart(2, "0");
}

// Only ever returns "specific" when an explicit date/period is stated in the
// text - "unspecified" is the honest default, not "assume present-day".
// Known gap: two unspecified-scope claims about the same evergreen-sounding
// proposition, posted months apart, are treated as temporally compatible -
// this doesn't detect implicit drift, only explicit conflicting dates.
export function extractTemporalScope(text: string): TemporalScope {
  const monthYearMatch = text.match(MONTH_YEAR_PATTERN);
  if (monthYearMatch) {
    return {
      type: "specific",
      value: `${monthYearMatch[2]}-${monthToNumber(monthYearMatch[1])}`,
    };
  }

  const yearMatch = text.match(YEAR_PATTERN);
  if (yearMatch) {
    return { type: "specific", value: yearMatch[0] };
  }

  const lower = text.toLowerCase();
  for (const marker of RELATIVE_TEMPORAL_MARKERS) {
    if (lower.includes(marker)) {
      return { type: "relative", value: "current" };
    }
  }

  return { type: "unspecified", value: null };
}

// Unambiguous currency symbols only - "$" and "¥" are used by multiple
// countries and are deliberately excluded rather than guessed.
const CURRENCY_JURISDICTION: Record<string, string> = {
  "₦": "NG",
  "£": "GB",
  "€": "EU",
  "₹": "IN",
  "₩": "KR",
};

const KEYWORD_JURISDICTION: Array<[RegExp, string]> = [
  [/\bnigeria(n)?\b/i, "NG"],
  [/\b(united kingdom|britain|british)\b/i, "GB"],
  [/\b(united states|usa|american)\b/i, "US"],
  [/\bindia(n)?\b/i, "IN"],
  [/\bchina|chinese\b/i, "CN"],
  [/\beuropean union\b/i, "EU"],
];

// Null means "no jurisdiction signal detected" - treated as unspecified/
// global, never as a positive claim that the proposition applies everywhere.
export function extractJurisdiction(text: string): string | null {
  for (const symbol of Object.keys(CURRENCY_JURISDICTION)) {
    if (text.includes(symbol)) return CURRENCY_JURISDICTION[symbol];
  }
  for (const [pattern, code] of KEYWORD_JURISDICTION) {
    if (pattern.test(text)) return code;
  }
  return null;
}

const CAUSAL_PATTERN = /\b(causes?|caused by|leads? to|results? in|due to|because of)\b/i;
const COMPARATIVE_PATTERN =
  /\b(more\s+\w+\s+than|less\s+\w+\s+than|more than|less than|as effective as|compared to|higher than|lower than|better than|worse than)\b/i;
const STATISTICAL_PATTERN = /%|\bpercent(age)?\b|[₦£€₹₩$]\s?\d/;

// Structural category of the proposition, checked in this priority order
// when multiple patterns match - a coarse, explainable heuristic, not a
// claim about the domain or the truth of the statement.
export function classifyClaimType(text: string): ClaimType {
  if (CAUSAL_PATTERN.test(text)) return "causal";
  if (COMPARATIVE_PATTERN.test(text)) return "comparative";
  if (STATISTICAL_PATTERN.test(text)) return "statistical";
  return "existential";
}

const DOMAIN_KEYWORDS: Array<[ClaimDomain, RegExp]> = [
  [
    "medical",
    /\b(diabetes|diabetic|cancer|vaccine|vaccination|covid|coronavirus|treatment|disease|health|wound|ulcer|infection|blood pressure|insulin|medication|doctor|hospital|therapy|cure|medicine|mental health|antibiotic|surgery)\b/i,
  ],
  [
    "political",
    /\b(election|government|president|minister|senate|parliament|governor|political party|vote|voting|policy|legislation|law|coup|protest|referendum)\b/i,
  ],
  [
    "economic",
    /\b(inflation|gdp|economy|economic|unemployment|wage|salary|tax|budget|currency|exchange rate|interest rate|subsidy|market|stock market|trade)\b/i,
  ],
  [
    "scientific",
    /\b(climate|physics|biology|chemistry|research|study|universe|evolution|genetic|scientist|experiment)\b/i,
  ],
];

// Coarse, keyword-based topical classification, checked in this priority
// order when multiple domains' keywords appear - medical is checked first
// because this codebase already treats medical misinformation as the
// highest-stakes category elsewhere (lib/aiModeration.ts, lib/expertReview.ts).
export function classifyClaimDomain(text: string): ClaimDomain {
  for (const [domain, pattern] of DOMAIN_KEYWORDS) {
    if (pattern.test(text)) return domain;
  }
  return "general";
}

export function computeClaimIdentity(rawText: string): ClaimIdentity {
  const canonicalText = rawText.trim().replace(/\s+/g, " ");
  const normalizedText = normalizeClaimText(canonicalText);
  const temporalScope = extractTemporalScope(canonicalText);
  const jurisdiction = extractJurisdiction(canonicalText);
  const claimType = classifyClaimType(canonicalText);
  const domain = classifyClaimDomain(canonicalText);

  const identityKey = crypto
    .createHash("sha256")
    .update(`${normalizedText}|${temporalScope.value ?? "unspecified"}|${jurisdiction ?? "unspecified"}`)
    .digest("hex");

  return {
    canonicalText,
    normalizedText,
    identityKey,
    claimType,
    domain,
    jurisdiction,
    temporalScope,
  };
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of",
  "in", "on", "at", "to", "for", "and", "or", "but", "with", "as", "by",
  "that", "this", "these", "those", "it", "its", "has", "have", "had",
  "will", "would", "can", "could", "should", "from", "not", "does", "did",
  "than", "into", "about", "which", "who", "what",
]);

function significantTokens(normalizedText: string): Set<string> {
  return new Set(
    normalizedText
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Threshold for the "possible match" tier - deliberately a round, visibly-
// chosen number, not tuned against the benchmark (tests/benchmark/vvb-mini).
const POSSIBLE_MATCH_THRESHOLD = 0.6;

function scopeConflicts(
  a: TemporalScope,
  b: TemporalScope
): boolean {
  return a.type === "specific" && b.type === "specific" && a.value !== b.value;
}

// Pairwise comparison used for benchmarking and for the best-effort
// possible-duplicate search in lib/claimIdentity.ts - NOT the mechanism that
// actually decides find-or-create (that's identityKey equality, which only
// ever captures exact/high_confidence). A hard temporal or jurisdiction
// conflict forces no_match regardless of text similarity - Phase 7/8's
// requirement that scope is part of identity, not just a tiebreaker.
export function matchClaims(a: ClaimIdentity, b: ClaimIdentity): ClaimMatchTier {
  if (scopeConflicts(a.temporalScope, b.temporalScope)) return "no_match";
  if (a.jurisdiction && b.jurisdiction && a.jurisdiction !== b.jurisdiction) {
    return "no_match";
  }

  if (a.normalizedText === b.normalizedText) {
    return a.canonicalText.trim().toLowerCase() === b.canonicalText.trim().toLowerCase()
      ? "exact"
      : "high_confidence";
  }

  const similarity = jaccardSimilarity(
    significantTokens(a.normalizedText),
    significantTokens(b.normalizedText)
  );

  return similarity >= POSSIBLE_MATCH_THRESHOLD ? "possible" : "no_match";
}
