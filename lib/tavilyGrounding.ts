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

function classifyStance(
  content: string,
  query: string
): GroundingSource["stance"] {
  if (!content) return "unknown";

  // Split title from body - title is passed first in "title + content" string.
  // Title signals are more reliable than body signals so weight them separately.
  const fullText = content.toLowerCase();
  const titlePortion = fullText.slice(0, 120); // title is typically < 100 chars
  const bodyPortion = fullText.slice(0, 800);

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
  const titleContradictionHits = contradictionSignals.filter(s =>
    titlePortion.includes(s)
  ).length;

  if (titleContradictionHits >= 1) {
    return "contradicts";
  }

  // Title-level support with no title contradiction.
  const titleSupportHits = supportSignals.filter(s =>
    titlePortion.includes(s)
  ).length;

  if (titleSupportHits >= 2 && titleContradictionHits === 0) {
    return "supports";
  }

  // Fall back to body content analysis.
  const contradictionScore = contradictionSignals.filter(s =>
    bodyPortion.includes(s)
  ).length;
  const supportScore = supportSignals.filter(s =>
    bodyPortion.includes(s)
  ).length;

  if (contradictionScore >= 1 && contradictionScore >= supportScore) {
    return "contradicts";
  }
  if (supportScore >= 1 && supportScore > contradictionScore) {
    return "supports";
  }
  if (contradictionScore > 0 || supportScore > 0) {
    return "context";
  }
  return "unknown";
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
    .map(r => ({
      title: r.title?.trim() ?? "",
      url: r.url?.trim() ?? "",
      domain: extractDomain(r.url ?? ""),
      stance: classifyStance(
        (r.title ?? "") + " " + (r.content ?? ""),
        content
      ),
    }));

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
