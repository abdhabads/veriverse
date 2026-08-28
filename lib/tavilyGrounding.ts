// lib/tavilyGrounding.ts
// Free-tier grounding fallback using Tavily Search API
// Sign up at tavily.com - free tier: 1,000 searches/month
// Add TAVILY_API_KEY to .env.local

import type { GroundingResult, GroundingSource } from "@/lib/groundedFactCheck";

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clampAdjustment(value: number): number {
  return Math.max(-25, Math.min(25, Math.round(value)));
}

// Generic (non-medical) signals used as a fallback layer below, for claims
// that don't hit any of the clinical/medical vocabulary above - e.g. political,
// historical, or biographical facts. Kept conservative: only strong, unambiguous
// falsity language counts as a contradiction, since a naive "former"/"resigned"
// style negation list produces false contradictions on ordinary biographical
// text (e.g. a bio mentioning a past role while confirming a current one).
//
// Deliberately has no "supports" counterpart: keyword overlap plus generic
// confirmation words (e.g. "elected", "as of") cannot distinguish a source
// that confirms a person currently holds a role from one that's simply about
// that person in the context of that role - e.g. a losing candidate's
// biography contains "president", "elected", and their name constantly
// without ever confirming they hold the office. Defaulting an on-topic-but-
// unconfirmed source to "supports" produced a confident false positive on a
// claim as untrue as "Peter Obi is the current president of Nigeria". Since
// verifying "X currently holds role Y" needs real comprehension (which the
// primary OpenAI grounding path provides), this lexical fallback only ever
// asserts the direction it can support with high precision - contradiction -
// and otherwise reports "context": relevant, but not confidently one way or
// the other.
const GENERIC_CONTRADICTION_SIGNALS = [
  "false", "fake", "hoax", "myth", "debunked", "denies", "denied",
  "incorrect", "inaccurate", "not true", "isn't true", "misinformation",
  "unfounded", "fabricated", "no evidence",
];

const CLAIM_KEYWORD_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of",
  "in", "on", "at", "to", "for", "and", "or", "but", "with", "as", "by",
  "that", "this", "these", "those", "it", "its", "has", "have", "had",
  "will", "would", "can", "could", "should", "from", "current", "currently",
  "not", "does", "did", "than", "into", "about", "which", "who", "what",
]);

function extractClaimKeywords(claim: string): string[] {
  return Array.from(
    new Set(
      claim
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !CLAIM_KEYWORD_STOPWORDS.has(w))
    )
  );
}

// Captures the sentence in `original` (natural case) surrounding the first
// occurrence of `needle` in `haystackLower` (lowercased, same indexing as
// `original`). Falls back to the whole slice if no boundary is found -
// used to turn "a signal matched somewhere in this portion" into an actual
// quotable excerpt for stanceEvidence.
function findSentence(original: string, haystackLower: string, needle: string): string {
  const idx = haystackLower.indexOf(needle);
  if (idx === -1) return original.trim();

  const before = haystackLower.slice(0, idx);
  const boundary = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
    before.lastIndexOf("\n")
  );
  const start = boundary === -1 ? 0 : boundary + 2;

  const afterMatchStart = idx + needle.length;
  const rest = haystackLower.slice(afterMatchStart);
  const endOffset = rest.search(/[.!?](\s|$)/);
  const end = endOffset === -1 ? original.length : afterMatchStart + endOffset + 1;

  return original.slice(start, end).trim();
}

// Of several signals that matched the same portion, picks the one that
// appears earliest in the text - the one a reader would actually hit first.
function earliestMatch(portion: string, matches: string[]): string {
  return matches.reduce((best, candidate) => {
    const bestIdx = portion.indexOf(best);
    const candidateIdx = portion.indexOf(candidate);
    return candidateIdx !== -1 && candidateIdx < bestIdx ? candidate : best;
  });
}

type StanceClassification = {
  stance: GroundingSource["stance"];
  stanceEvidence: string | null;
};

// Topic-overlap fallback: for claims outside the medical vocabulary above,
// only ever asserts "contradicts" (from explicit falsity language) or
// "context" (topically relevant, stance not confidently determined). Never
// returns "supports" - see comment on GENERIC_CONTRADICTION_SIGNALS for why.
// Runs only when the medical-specific signals found nothing, so it never
// overrides a higher-precision clinical classification.
function classifyByTopicOverlap(
  originalBodyPortion: string,
  bodyPortion: string,
  claim: string
): StanceClassification {
  const keywords = extractClaimKeywords(claim);
  if (keywords.length === 0) return { stance: "unknown", stanceEvidence: null };

  const matched = keywords.filter((k) => bodyPortion.includes(k));
  const overlapRatio = matched.length / keywords.length;

  if (overlapRatio < 0.4) return { stance: "unknown", stanceEvidence: null };

  const contradictionSignal = GENERIC_CONTRADICTION_SIGNALS.find((s) =>
    bodyPortion.includes(s)
  );
  if (contradictionSignal) {
    return {
      stance: "contradicts",
      stanceEvidence: findSentence(originalBodyPortion, bodyPortion, contradictionSignal),
    };
  }

  // Keyword overlap alone isn't one quotable phrase - don't invent one.
  return { stance: "context", stanceEvidence: null };
}

export function classifyStance(
  content: string,
  query: string
): GroundingSource["stance"] {
  return classifyStanceWithEvidence(content, query).stance;
}

// Same classification as classifyStance, plus the text span that triggered
// it. Kept as a separate entry point so classifyStance's tested return type
// (just the stance) never changes - this function does no additional
// classification, it only captures what the layer below already decided.
export function classifyStanceWithEvidence(
  content: string,
  query: string
): StanceClassification {
  if (!content) return { stance: "unknown", stanceEvidence: null };

  // Split title from body - title is passed first in "title + content" string.
  // Title signals are more reliable than body signals so weight them separately.
  const fullText = content.toLowerCase();
  const titlePortion = fullText.slice(0, 120); // title is typically < 100 chars
  const bodyPortion = fullText.slice(0, 800);
  const originalTitlePortion = content.slice(0, 120);
  const originalBodyPortion = content.slice(0, 800);

  const contradictionSignals = [
    "no evidence", "not supported", "disproven", "false", "myth",
    "no scientific", "lacks evidence", "not proven", "ineffective",
    "does not", "cannot", "risk", "dangerous", "warning", "caution",
    "contradict", "refute", "debunk", "misleading", "misinformation",
    "not recommended", "advise against", "avoid", "should not",
    "no clinical evidence", "insufficient evidence", "limited evidence",
    "not established", "no benefit", "harm", "adverse", "complication",
    "may worsen", "can worsen", "increases risk", "infection risk",
    "not suitable", "contraindicated", "do not use", "lacks support",
    "not approved", "unproven", "anecdotal", "no controlled",
  ];

  const supportSignals = [
    "evidence shows", "studies show", "research confirms", "proven",
    "effective", "beneficial", "recommended", "supports", "confirms",
    "shown to", "demonstrated", "associated with benefit",
    "improves", "reduces", "promotes healing", "faster healing",
  ];

  // Title-level contradiction is a strong signal - return immediately.
  const titleContradictionMatches = contradictionSignals.filter(s =>
    titlePortion.includes(s)
  );

  if (titleContradictionMatches.length >= 1) {
    return {
      stance: "contradicts",
      stanceEvidence: findSentence(
        originalTitlePortion,
        titlePortion,
        earliestMatch(titlePortion, titleContradictionMatches)
      ),
    };
  }

  // Title-level support with no title contradiction.
  const titleSupportMatches = supportSignals.filter(s =>
    titlePortion.includes(s)
  );

  if (titleSupportMatches.length >= 2) {
    return {
      stance: "supports",
      stanceEvidence: findSentence(
        originalTitlePortion,
        titlePortion,
        earliestMatch(titlePortion, titleSupportMatches)
      ),
    };
  }

  // Fall back to body content analysis.
  const contradictionMatches = contradictionSignals.filter(s =>
    bodyPortion.includes(s)
  );
  const supportMatches = supportSignals.filter(s =>
    bodyPortion.includes(s)
  );
  const contradictionScore = contradictionMatches.length;
  const supportScore = supportMatches.length;

  if (contradictionScore >= 1 && contradictionScore >= supportScore) {
    return {
      stance: "contradicts",
      stanceEvidence: findSentence(
        originalBodyPortion,
        bodyPortion,
        earliestMatch(bodyPortion, contradictionMatches)
      ),
    };
  }
  if (supportScore >= 1 && supportScore > contradictionScore) {
    return {
      stance: "supports",
      stanceEvidence: findSentence(
        originalBodyPortion,
        bodyPortion,
        earliestMatch(bodyPortion, supportMatches)
      ),
    };
  }
  if (contradictionScore > 0 || supportScore > 0) {
    // Tied contradiction/support signals - "context" here isn't one
    // triggering phrase, so don't manufacture an excerpt for it.
    return { stance: "context", stanceEvidence: null };
  }

  // No clinical/medical signal at all - fall back to generic topic-overlap
  // classification so non-medical claims (political, historical, biographical,
  // etc.) aren't stuck at "unknown" just because this source's vocabulary
  // doesn't happen to use clinical phrasing.
  return classifyByTopicOverlap(originalBodyPortion, bodyPortion, query);
}

function deriveRiskAdjustment(sources: GroundingSource[]): number {
  const contradictions = sources.filter(s => s.stance === "contradicts").length;
  const supports = sources.filter(s => s.stance === "supports").length;

  if (contradictions >= 2) return clampAdjustment(contradictions * 8);
  if (contradictions === 1) return clampAdjustment(10);
  if (supports >= 2) return clampAdjustment(-(supports * 6));
  if (supports === 1) return clampAdjustment(-5);
  return 0;
}

function buildCounterQuery(content: string): string {
  const text = content.toLowerCase();

  // Honey + wound claims - the risk is raw honey specifically
  if ((text.includes("honey") && text.includes("wound")) ||
      (text.includes("honey") && text.includes("ulcer"))) {
    return "raw honey diabetic foot ulcer risks infection contamination not recommended clinical guidelines";
  }

  // Antibiotic claims
  if (text.includes("antibiotic") && (text.includes("unnecessary") || text.includes("not needed"))) {
    return "antibiotics infected diabetic foot ulcer necessary treatment guidelines NICE IDSA";
  }

  // Dietary/supplement claims replacing medication
  if ((text.includes("cinnamon") || text.includes("aloe") || text.includes("turmeric") ||
       text.includes("garlic") || text.includes("supplement")) &&
      (text.includes("diabetes") || text.includes("diabetic"))) {
    return "dietary supplement diabetes medication replacement evidence clinical trial risks";
  }

  // Weight bearing / offloading claims
  if (text.includes("weight-bearing") || text.includes("weight bearing") ||
      text.includes("immobili")) {
    return "diabetic foot ulcer offloading weight bearing evidence healing guidelines";
  }

  // Cancer claims
  if (text.includes("cancer") || text.includes("tumour") || text.includes("tumor")) {
    return `${content.slice(0, 150)} cancer risks no evidence not proven clinical guidelines`;
  }

  // Vaccine claims
  if (text.includes("vaccine") || text.includes("mmr") || text.includes("vaccination")) {
    return `${content.slice(0, 150)} vaccine safety evidence WHO CDC clinical evidence`;
  }

  // Generic medical counter query
  return `${content.slice(0, 200)} risks evidence against not recommended clinical guidelines`;
}

export async function runTavilyGrounding(
  content: string
): Promise<GroundingResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  const claimText = content.slice(0, 300);
  const text = content.toLowerCase();

  const medicalTerms = [
    "diabetes", "diabetic", "cancer", "wound", "ulcer", "infection",
    "vaccine", "insulin", "blood pressure", "heart", "stroke", "depression",
    "antibiotic", "covid", "virus", "treatment", "therapy", "cure", "honey",
  ];
  const isMedicalClaim = medicalTerms.some(term => text.includes(term));

  // Build two queries: one for the topic, one explicitly for counter-evidence
  const queries = isMedicalClaim
    ? [
      claimText,
      buildCounterQuery(content),
    ]
    : [claimText];

  // Run queries in parallel, collect all results
  const allResults: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }> = [];

  await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            search_depth: "basic",
            include_answer: false,
            include_raw_content: true,
            max_results: 4,
          }),
        });

        if (!response.ok) return;

        const data = await response.json();
        if (Array.isArray(data.results)) {
          allResults.push(...data.results);
        }
      } catch {
        // individual query failure is non-fatal
      }
    })
  );

  if (allResults.length === 0) {
    throw new Error("Tavily returned no results for any query");
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const dedupedResults = allResults.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, 5);

  const groundingSources: GroundingSource[] = dedupedResults
    .filter(r => r.url && r.title)
    .map(r => {
      const { stance, stanceEvidence } = classifyStanceWithEvidence(
        (r.title ?? "") + " " + (r.content ?? ""),
        content
      );
      return {
        title: r.title?.trim() ?? "",
        url: r.url?.trim() ?? "",
        domain: extractDomain(r.url ?? ""),
        stance,
        stanceEvidence,
      };
    });

  // Build summary from classified sources
  const contradictingSources = groundingSources.filter(s => s.stance === "contradicts");
  const supportingSources = groundingSources.filter(s => s.stance === "supports");

  let groundingSummary = "";
  if (contradictingSources.length > 0 && supportingSources.length === 0) {
    groundingSummary = `Retrieved sources contradict this claim. ${contradictingSources.length} source${contradictingSources.length === 1 ? "" : "s"} found opposing evidence.`;
  } else if (contradictingSources.length > 0 && supportingSources.length > 0) {
    groundingSummary = `Evidence is mixed. ${contradictingSources.length} source${contradictingSources.length === 1 ? "" : "s"} contradict this claim and ${supportingSources.length} provide supporting context.`;
  } else if (supportingSources.length > 0) {
    groundingSummary = "Retrieved sources provide supporting evidence for this claim.";
  } else if (groundingSources.length > 0) {
    groundingSummary = `${groundingSources.length} relevant source${groundingSources.length === 1 ? "" : "s"} retrieved. Evidence stance is unclear.`;
  } else {
    groundingSummary = "";
  }

  const groundingStatus =
    groundingSources.length > 0 ? "checked" : "insufficient_evidence";

  const evidenceRiskAdjustment = deriveRiskAdjustment(groundingSources);

  return {
    groundingStatus,
    groundingSummary,
    groundingSources,
    evidenceRiskAdjustment,
    raw: { results: dedupedResults },
  };
}
