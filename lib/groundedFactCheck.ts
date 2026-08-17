import { getOpenAIClient } from "@/lib/openai";
import { truncateAtSentence } from "@/lib/textUtils";

export type GroundingSource = {
  title: string;
  url: string;
  domain: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
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

export async function runGroundedFactCheck(
  content: string
): Promise<GroundingResult> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_TEXT_MODEL;

  if (!model) {
    throw new Error("OPENAI_TEXT_MODEL is not set");
  }

  try {
    const response = await client.responses.create({
      model,
      include: ["web_search_call.action.sources"],
      tools: [
        {
          type: "web_search_preview",
        },
      ],
      input: [
        {
          role: "system",
          content: `
You are a source-grounded claim checker for a misinformation-aware social platform.

Your job:
1. Search the web for trustworthy sources relevant to the user's post.
2. Determine whether the best available sources support, contradict, or only contextualize the core claim.
3. Return JSON only.

Required JSON shape:
{
  "groundingStatus": "checked" | "insufficient_evidence",
  "groundingSummary": string,
  "groundingSources": [
    {
      "title": string,
      "url": string,
      "stance": "supports" | "contradicts" | "context" | "unknown"
    }
  ],
  "evidenceRiskAdjustment": number
}

Rules:
- Prefer authoritative or broadly trusted sources.
- If evidence strongly contradicts the claim, use a positive adjustment like +10 to +25.
- If evidence strongly supports the claim, use a negative adjustment like -5 to -20.
- If evidence is mixed or weak, use a small adjustment or 0.
- Keep source list short: max 5.
- Return JSON only.
        `.trim(),
        },
        {
          role: "user",
          content: content,
        },
      ],
    });

    const outputText = (response as any).output_text;
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
          .map((item: any) => ({
            title: typeof item.title === "string" ? item.title.trim() : "",
            url: item.url.trim(),
            domain: extractDomain(item.url.trim()),
            stance: ["supports", "contradicts", "context", "unknown"].includes(item.stance)
              ? item.stance
              : "unknown",
          }))
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
      raw: parsed,
    };
  } catch (error) {
    throw error;
  }
}