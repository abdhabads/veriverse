import Claim from "@/models/Claim";
import ClaimComponent from "@/models/ClaimComponent";
import {
  extractPropositionComponents,
  PROPOSITION_SCHEMA_VERSION,
  EXTRACTION_MODEL_VERSION,
  NORMALIZATION_VERSION,
} from "@/lib/propositionExtraction";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of",
  "in", "on", "at", "to", "for", "and", "or", "but", "with", "as", "by",
  "that", "this", "these", "those", "it", "its", "has", "have", "had",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Drop a singular possessive suffix ("Nigeria's" -> "nigeria") BEFORE
      // stripping punctuation generally - otherwise the apostrophe-strip
      // below merges it into "nigerias", which never matches the bare word
      // "nigeria" elsewhere. Found via Sprint 5.5/5.6's evidence-targeting
      // diagnostic (tests/benchmark/vvb-mini/evidence-targeting-cases.json):
      // "Nigeria's central bank..." failed to target a component containing
      // "...in Nigeria" for exactly this reason. A bare trailing possessive
      // apostrophe with no "s" ("companies'") already normalized correctly
      // without this - punctuation-stripping alone removes the apostrophe
      // and leaves the already-plural word intact.
      .replace(/'s\b/g, "")
      .replace(/[.,!?;:"'()[\]{}]/g, "")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

// Phase 10: conservative, deterministic evidence-to-component targeting.
// For a non-compound claim (the vast majority) there is only one component,
// so every piece of evidence unambiguously targets it. For a genuinely
// compound claim, an evidence item is only assigned to a component when its
// token overlap with that component's propositionText is both non-trivial
// AND clearly ahead of every other component's overlap - anything tied or
// merely "somewhat higher" stays unassigned (null) rather than guessed.
// This is NOT semantic matching, just a conservative first layer, same
// spirit as lib/claimNormalization.ts's matchClaims().
export function assignEvidenceToComponent(
  evidenceText: string | null,
  components: Array<{ id: string; propositionText: string }>
): string | null {
  if (components.length === 0) return null;
  if (components.length === 1) return components[0].id;
  if (!evidenceText) return null;

  const evidenceTokens = significantTokens(evidenceText);
  if (evidenceTokens.size === 0) return null;

  const scored = components
    .map((component) => ({
      id: component.id,
      overlap: overlapCount(evidenceTokens, significantTokens(component.propositionText)),
    }))
    .sort((a, b) => b.overlap - a.overlap);

  const best = scored[0];
  const runnerUp = scored[1];
  if (best.overlap >= 2 && best.overlap > runnerUp.overlap) {
    return best.id;
  }
  return null;
}

export async function getClaimComponents(
  claimId: string,
  propositionSchemaVersion: string = PROPOSITION_SCHEMA_VERSION
) {
  return ClaimComponent.find({ claim: claimId, propositionSchemaVersion }).sort({ componentIndex: 1 });
}

// Idempotent and race-safe per (claim, propositionSchemaVersion, componentIndex)
// via the model's unique index + create-then-catch-duplicate-key, the same
// pattern as Sprint 0/2/3's other persistence functions. The initial
// "already exists" check is a pure optimization, not the safety mechanism -
// extraction is a deterministic pure function of the claim's own
// (immutable) canonicalText, so two concurrent callers that both miss the
// early-return compute identical candidate components and race safely on
// the actual inserts below.
export async function ensureClaimComponents(claimId: string): Promise<any[]> {
  const existing = await getClaimComponents(claimId);
  if (existing.length > 0) return existing;

  const claim = await Claim.findById(claimId).select("canonicalText");
  if (!claim) return [];

  const extracted = extractPropositionComponents(claim.canonicalText);
  const results: any[] = [];

  for (const component of extracted) {
    try {
      const doc = await ClaimComponent.create({
        claim: claimId,
        componentIndex: component.componentIndex,
        propositionText: component.propositionText,
        sourceTextSpan: component.sourceTextSpan,
        subject: component.subject,
        predicate: component.predicate,
        object: component.object,
        entities: component.entities,
        quantity: component.quantity,
        negation: component.negation,
        attribution: component.attribution,
        modality: component.modality,
        conditionality: component.conditionality,
        temporalScope: component.temporalScope,
        jurisdiction: component.jurisdiction,
        extractionModelVersion: EXTRACTION_MODEL_VERSION,
        normalizationVersion: NORMALIZATION_VERSION,
        propositionSchemaVersion: PROPOSITION_SCHEMA_VERSION,
      });
      results.push(doc);
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) {
        const winner = await ClaimComponent.findOne({
          claim: claimId,
          propositionSchemaVersion: PROPOSITION_SCHEMA_VERSION,
          componentIndex: component.componentIndex,
        });
        if (winner) results.push(winner);
        continue;
      }
      throw err;
    }
  }

  return results;
}
