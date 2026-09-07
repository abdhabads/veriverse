import crypto from "crypto";
import EvidenceObject from "@/models/EvidenceObject";
import { hashContent } from "@/lib/hash";
import { assessSourceAuthority, SourceType } from "@/lib/sourceAuthority";
import { computeCanonicalUrl, computeIndependenceGroups } from "@/lib/sourceIndependence";

// The pre-persistence shape a grounding provider (groundedFactCheck.ts,
// tavilyGrounding.ts) produces for each source. Deliberately provider-agnostic
// and DB-free, so those modules stay unit-testable without mocking Mongoose -
// this file (which does connect to the DB via the EvidenceObject model) owns
// enrichment (authority/independence) and persistence instead.
export type EvidenceCandidate = {
  sourceUrl: string;
  domain: string;
  publisher?: string;
  publishedAt?: Date | null;
  stance: "supports" | "contradicts" | "context" | "unknown";
  // 0-1 heuristic confidence in the stance classification - see the
  // provider that produced this candidate for how it's derived.
  stanceConfidence: number;
  evidenceText: string | null;
  // Only non-null when evidenceText is a span into content this candidate's
  // provider actually retrieved (not an LLM's narrative about it).
  evidenceStart: number | null;
  evidenceEnd: number | null;
  // 0-1. Provider-reported where available (Tavily), heuristic otherwise.
  relevanceScore: number;
  provider: "openai" | "tavily";
  // Sprint 4 (Phase 10): which proposition within the claim this evidence
  // targets, if determined - see lib/claimComponents.ts's
  // assignEvidenceToComponent. Optional/additive; null when not determined
  // (including every candidate from before this sprint).
  claimComponentId?: string | null;
};

export type PersistedEvidenceObject = {
  evidenceObjectId: string;
  sourceUrl: string;
  stance: EvidenceCandidate["stance"];
  authorityScore: number;
  relevanceScore: number;
  stanceConfidence: number;
  independenceGroup: string;
  sourceType: SourceType;
  // Sprint 2: false when an existing EvidenceObject for the same claim was
  // reused instead of inserting a duplicate (see the claimId dedup below).
  // Always true when claimId is omitted - Sprint 1 behavior, unchanged.
  created: boolean;
  claimComponentId: string | null;
};

function derivePublisherFromDomain(domain: string): string {
  const first = (domain || "").split(".")[0] || "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// Enriches each candidate with authority/independence, persists one
// EvidenceObject per candidate, and returns lightweight refs (for attaching
// evidenceObjectId onto the legacy groundingSources array) plus the fields
// lib/evidenceScoring.ts needs, so callers don't need a DB round-trip to
// score what was just written.
//
// claimId is optional and additive (Sprint 1 callers that omit it get exactly
// Sprint 1 behavior - no dedup, always inserts). When provided, a candidate
// whose sourceUrl + evidenceHash already exists for this claim is treated as
// a re-retrieval of evidence already on record, not new evidence - Phase 5's
// "do not create duplicate evidence merely because multiple posts refer to
// the same claim" - and the existing row is reused instead of duplicated.
export async function persistEvidenceObjects(params: {
  contentHash: string;
  claimId?: string | null;
  candidates: EvidenceCandidate[];
}): Promise<PersistedEvidenceObject[]> {
  const { contentHash, claimId, candidates } = params;
  if (candidates.length === 0) return [];

  const providerRunId = crypto.randomUUID();
  const retrievedAt = new Date();

  const withHashes = candidates.map((candidate) => ({
    ...candidate,
    evidenceHash: candidate.evidenceText ? hashContent(candidate.evidenceText) : null,
  }));

  const independenceGroups = computeIndependenceGroups(
    withHashes.map((candidate) => ({
      domain: candidate.domain,
      evidenceHash: candidate.evidenceHash,
    }))
  );

  const results: PersistedEvidenceObject[] = [];

  for (let index = 0; index < withHashes.length; index += 1) {
    const candidate = withHashes[index];
    const authority = assessSourceAuthority(candidate.domain);
    const doc = {
      claimId: claimId || null,
      claimComponentId: candidate.claimComponentId || null,
      contentHash,
      sourceUrl: candidate.sourceUrl,
      canonicalUrl: computeCanonicalUrl(candidate.sourceUrl),
      publisher: candidate.publisher?.trim() || derivePublisherFromDomain(candidate.domain),
      domain: candidate.domain,
      sourceType: authority.sourceType,
      publishedAt: candidate.publishedAt ?? null,
      retrievedAt,
      authorityScore: authority.authorityScore,
      relevanceScore: Math.max(0, Math.min(1, candidate.relevanceScore)),
      independenceGroup: independenceGroups[index],
      stance: candidate.stance,
      stanceConfidence: Math.max(0, Math.min(1, candidate.stanceConfidence)),
      evidenceText: candidate.evidenceText,
      evidenceStart: candidate.evidenceStart,
      evidenceEnd: candidate.evidenceEnd,
      evidenceHash: candidate.evidenceHash,
      provider: candidate.provider,
      providerRunId,
    };

    if (claimId) {
      const existing = await EvidenceObject.findOne({
        claimId,
        sourceUrl: doc.sourceUrl,
        evidenceHash: doc.evidenceHash,
      });
      if (existing) {
        results.push({
          evidenceObjectId: String(existing._id),
          sourceUrl: existing.sourceUrl,
          stance: existing.stance,
          authorityScore: existing.authorityScore,
          relevanceScore: existing.relevanceScore,
          stanceConfidence: existing.stanceConfidence,
          independenceGroup: existing.independenceGroup,
          sourceType: existing.sourceType,
          created: false,
          claimComponentId: existing.claimComponentId ? String(existing.claimComponentId) : null,
        });
        continue;
      }
    }

    const inserted = await EvidenceObject.create(doc);
    results.push({
      evidenceObjectId: String(inserted._id),
      sourceUrl: doc.sourceUrl,
      stance: doc.stance,
      authorityScore: doc.authorityScore,
      relevanceScore: doc.relevanceScore,
      stanceConfidence: doc.stanceConfidence,
      independenceGroup: doc.independenceGroup,
      sourceType: doc.sourceType,
      created: true,
      claimComponentId: doc.claimComponentId,
    });
  }

  return results;
}
