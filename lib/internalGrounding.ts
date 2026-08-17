import { getOpenAIClient } from "@/lib/openai";
import { truncateAtSentence } from "@/lib/textUtils";

export type InternalGroundingResult = {
  internalSummary: string;
  internalEvidenceAdjustment: number;
  internalSources: Array<{
    file_name: string;
    score?: number;
  }>;
};

function clampAdjustment(value: number): number {
  return Math.max(-20, Math.min(20, Math.round(value)));
}

export async function runInternalGrounding(
  content: string
): Promise<InternalGroundingResult> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_TEXT_MODEL;
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;

  if (!model || !vectorStoreId) {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }

  const response = await client.responses.create({
    model,
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId],
      } as any,
    ],
    include: ["file_search_call.results"],
    input: [
      {
        role: "system",
        content: `
You are checking a user post against trusted internal reference documents.
Return JSON only in this shape:

{
  "internalSummary": string,
  "internalEvidenceAdjustment": number,
  "internalSources": [
    { "file_name": string, "score": number }
  ]
}

Use:
- negative adjustment if trusted internal documents support the claim
- positive adjustment if they contradict it
- 0 if there is not enough evidence
        `.trim(),
      },
      {
        role: "user",
        content,
      },
    ],
  });

  const outputText = (response as any).output_text;
  if (!outputText || typeof outputText !== "string") {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }

  try {
    const parsed = JSON.parse(outputText);

    return {
      internalSummary:
        typeof parsed.internalSummary === "string"
          ? truncateAtSentence(parsed.internalSummary.trim(), 600)
          : "",
      internalEvidenceAdjustment: clampAdjustment(
        parsed.internalEvidenceAdjustment || 0
      ),
      internalSources: Array.isArray(parsed.internalSources)
        ? parsed.internalSources.slice(0, 5)
        : [],
    };
  } catch {
    return {
      internalSummary: "",
      internalEvidenceAdjustment: 0,
      internalSources: [],
    };
  }
}