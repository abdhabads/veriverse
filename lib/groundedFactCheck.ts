import { getOpenAIClient } from "@/lib/openai";
import { truncateAtSentence } from "@/lib/textUtils";
import { logEvent } from "@/lib/logger";

export type GroundingSource = {
  title: string;
  url: string;
  domain: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
  stanceEvidence: string | null;
};

export type GroundingResult = {
  groundingStatus: "checked" | "insufficient_evidence";
  groundingSummary: string;
  groundingSources: GroundingSource[];
  evidenceRiskAdjustment: number;
  raw?: unknown;
};

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

// Smart quotes -> straight quotes, collapsed whitespace. Used to compare a
// model-returned "quote" against the research text it was supposedly pulled
// from without false negatives from cosmetic differences in punctuation/
// line breaks - not to loosen the check into a fuzzy/paraphrase match.
function normalizeForQuoteMatch(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Verifies a claimed stanceEvidence quote actually occurs in the text the
// model researched, so we never display a fabricated/paraphrased quote in
// quotation marks attributed to a real source.
function isQuoteVerifiedInText(candidate: string, sourceText: string): boolean {
  const normalizedCandidate = normalizeForQuoteMatch(candidate);
  if (!normalizedCandidate) return false;
  return normalizeForQuoteMatch(sourceText).includes(normalizedCandidate);
}

const RESEARCH_SYSTEM_PROMPT = `
You are a source-grounded claim checker for a misinformation-aware social platform.

Search the web for trustworthy sources relevant to the user's post, and report
what you find in plain language with clear citations (title + URL). State
explicitly whether the sources support, contradict, or don't clearly resolve
the core claim. Prefer authoritative or broadly trusted sources.
`.trim();

const FORMAT_SYSTEM_PROMPT = `
Convert the research findings below into this exact JSON shape. Return JSON
only, no other text.

{
  "groundingStatus": "checked" | "insufficient_evidence",
  "groundingSummary": string,
  "groundingSources": [
    {
      "title": string,
      "url": string,
      "stance": "supports" | "contradicts" | "context" | "unknown",
      "stanceEvidence": string | null
    }
  ],
  "evidenceRiskAdjustment": number
}

"stanceEvidence" captures WHY a source got its stance, for display next to
it. If the research findings above quote or closely paraphrase a specific
sentence or phrase from that source that justifies its stance, put that
phrase in "stanceEvidence" (verbatim or near-verbatim from the findings,
not reworded). If the findings don't attribute a specific phrase to that
source - including whenever stance is "context" or "unknown" - set
"stanceEvidence" to null. Never invent or paraphrase a justification that
isn't actually in the research findings.

"stance" is ALWAYS relative to the user's claim as literally stated, never a
judgment of the source's general trustworthiness or topical relevance. A
source can be highly authoritative and directly on-topic while still
CONTRADICTING the claim - for example, if the claim asserts a specific
person currently holds a role or title, and a source shows a DIFFERENT
person actually holds it, that source CONTRADICTS the claim, even though
it is a reliable source clearly about that same role/title.

- "supports": the source confirms the claim as stated is true.
- "contradicts": the source shows the claim as stated is false (this
  includes sources that establish the correct fact is something else
  entirely, not just sources that explicitly call the claim "false").
- "context": relevant background that doesn't directly confirm or refute
  the specific claim.
- "unknown": the source's relationship to the claim can't be determined.

Every source's "stance" must be consistent with groundingSummary: if the
summary concludes the claim is false, the sources that establish that
should be marked "contradicts", not "supports".

Rules:
- If evidence strongly contradicts the claim, use a positive adjustment like +10 to +25.
- If evidence strongly supports the claim, use a negative adjustment like -5 to -20.
- If evidence is mixed or weak, use a small adjustment or 0.
- Keep source list short: max 5.
`.trim();

export async function runGroundedFactCheck(
  content: string
): Promise<GroundingResult> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_TEXT_MODEL;

  if (!model) {
    throw new Error("OPENAI_TEXT_MODEL is not set");
  }

  // The Responses API rejects combining the web_search_preview tool with
  // JSON-mode output ("Web Search cannot be used with JSON mode"), and
  // without JSON mode the model reliably ignores a "return JSON only"
  // instruction once it's actually invoking the search tool - it just
  // answers in prose with inline citations instead. So this runs as two
  // calls: an unconstrained research call with the search tool, then a
  // second call with no tools that formats those findings into strict JSON
  // (safe to use JSON mode here since no tool is involved).
  const searchResponse = await client.responses.create({
    model,
    include: ["web_search_call.action.sources"],
    tools: [
      {
        type: "web_search_preview",
      },
    ],
    input: [
      { role: "system", content: RESEARCH_SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });

  const researchText = (searchResponse as any).output_text;
  if (!researchText || typeof researchText !== "string") {
    throw new Error("Grounded fact check returned no research text");
  }

  const formatResponse = await client.responses.create({
    model,
    text: { format: { type: "json_object" } },
    input: [
      { role: "system", content: FORMAT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Claim: ${content}\n\nResearch findings:\n${researchText}`,
      },
    ],
  });

  const outputText = (formatResponse as any).output_text;
  if (!outputText || typeof outputText !== "string") {
    throw new Error("Grounded fact check returned no text");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Grounded fact check returned invalid JSON");
  }

  const groundingSources: GroundingSource[] = Array.isArray(parsed.groundingSources)
    ? parsed.groundingSources
        .filter((item: any) => item && typeof item.url === "string")
        .slice(0, 5)
        .map((item: any) => {
          const stance: GroundingSource["stance"] = [
            "supports",
            "contradicts",
            "context",
            "unknown",
          ].includes(item.stance)
            ? item.stance
            : "unknown";

          // Only "supports"/"contradicts" ever get a quoted justification -
          // "context"/"unknown" means no single phrase confidently decided it.
          const claimedEvidence =
            (stance === "supports" || stance === "contradicts") &&
            typeof item.stanceEvidence === "string" &&
            item.stanceEvidence.trim()
              ? item.stanceEvidence.trim()
              : null;

          // The model is asked to quote verbatim, but nothing stops it from
          // paraphrasing instead - which would show fabricated text in
          // quotation marks attributed to a real source. Reject any quote
          // that doesn't actually occur in the research text it came from;
          // showing nothing is strictly better than showing an unverifiable
          // quote.
          let stanceEvidence: string | null = null;
          if (claimedEvidence) {
            if (isQuoteVerifiedInText(claimedEvidence, researchText)) {
              stanceEvidence = truncateAtSentence(claimedEvidence, 240);
            } else {
              logEvent("GROUNDING_STANCE_EVIDENCE_UNVERIFIED", {
                url: item.url.trim(),
                stance,
                claimedEvidence: claimedEvidence.slice(0, 300),
              });
            }
          }

          return {
            title: typeof item.title === "string" ? item.title.trim() : "",
            url: item.url.trim(),
            domain: extractDomain(item.url.trim()),
            stance,
            stanceEvidence,
          };
        })
    : [];

  return {
    groundingStatus:
      parsed.groundingStatus === "checked" ? "checked" : "insufficient_evidence",
    groundingSummary:
      typeof parsed.groundingSummary === "string"
        ? truncateAtSentence(parsed.groundingSummary.trim(), 600)
        : "",
    groundingSources,
    evidenceRiskAdjustment: clampAdjustment(parsed.evidenceRiskAdjustment || 0),
    raw: { research: researchText, formatted: parsed },
  };
}