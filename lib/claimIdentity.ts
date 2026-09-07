import Claim from "@/models/Claim";
import ClaimAssessmentSnapshot from "@/models/ClaimAssessmentSnapshot";
import EvidenceObject from "@/models/EvidenceObject";
import {
  computeClaimIdentity,
  matchClaims,
  ClaimIdentity,
} from "@/lib/claimNormalization";
import { assessEvidenceStrength, EvidenceAssessment } from "@/lib/evidenceScoring";
import { SourceType } from "@/lib/sourceAuthority";
import { logEvent } from "@/lib/logger";

// Diagnostic-only. Strips anything that looks like a connection string
// (scheme + credentials/host) out of a driver error message before it is
// ever logged - defense in depth on top of the fact that these operations
// never touch MONGODB_URI, tokens, headers, or post content in the first
// place. Safe to remove once the production Claim-resolution failure is
// diagnosed; not load-bearing application behaviour.
function redactConnectionStrings(message: string): string {
  return message.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "mongodb://<redacted>");
}

function describeError(error: unknown): {
  errorName: string;
  errorCode: number | null;
  errorCodeName: string | null;
  errorMessage: string;
} {
  const err = error as { name?: string; code?: number; codeName?: string; message?: string };
  return {
    errorName: err?.name ?? (error instanceof Error ? error.constructor.name : typeof error),
    errorCode: typeof err?.code === "number" ? err.code : null,
    errorCodeName: typeof err?.codeName === "string" ? err.codeName : null,
    errorMessage: redactConnectionStrings(
      error instanceof Error ? error.message : String(error)
    ),
  };
}

export type FindOrCreateClaimResult = {
  claim: any;
  created: boolean;
  // "new": no existing claim found. "exact"/"high_confidence": reused an
  // existing claim via lib/claimNormalization.ts's identityKey - a
  // "possible" match is NEVER auto-merged, so it can't appear here (see
  // findPossibleDuplicate below, which only ever informs possibleDuplicateOf).
  matchTier: "exact" | "high_confidence" | "new";
};

// Bounded, best-effort search for a Phase 3 "possible match" among recent
// claims in the same domain - informational only (Claim.possibleDuplicateOf),
// never used to merge. Not a full-text search index; intentionally limited
// in scope (recent + same coarse domain) rather than scanning every claim
// ever created.
async function findPossibleDuplicate(identity: ClaimIdentity): Promise<string | null> {
  const candidates = await Claim.find({ domain: identity.domain })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("canonicalText normalizedText identityKey claimType domain jurisdiction temporalScope");

  for (const candidate of candidates) {
    const candidateIdentity: ClaimIdentity = {
      canonicalText: candidate.canonicalText,
      normalizedText: candidate.normalizedText,
      identityKey: candidate.identityKey,
      claimType: candidate.claimType,
      domain: candidate.domain,
      jurisdiction: candidate.jurisdiction,
      temporalScope: candidate.temporalScope,
    };
    if (matchClaims(identity, candidateIdentity) === "possible") {
      return String(candidate._id);
    }
  }

  return null;
}

// Atomic create-or-reuse keyed on identityKey (unique index on Claim) - the
// same create()-then-catch-duplicate-key pattern as Sprint 0's
// reserveTrustEvent/createIdempotentLog, for the same reason: it's race-safe
// without a separate find-then-create window. Two simultaneous posts with
// exact/high_confidence-matching claim text will have exactly one of them
// win the insert; the other reuses what the winner created instead of
// creating a duplicate canonical claim.
export async function findOrCreateClaim(claimText: string): Promise<FindOrCreateClaimResult> {
  const identity = computeClaimIdentity(claimText);

  let possibleDuplicateOf: string | null;
  const findStartedAt = Date.now();
  try {
    possibleDuplicateOf = await findPossibleDuplicate(identity);
  } catch (findError: unknown) {
    logEvent("CLAIM_DIAGNOSTIC_FIND_FAILED", {
      operation: "findPossibleDuplicate",
      elapsedMs: Date.now() - findStartedAt,
      ...describeError(findError),
    });
    throw findError;
  }

  const createStartedAt = Date.now();
  try {
    const claim = await Claim.create({
      canonicalText: identity.canonicalText,
      normalizedText: identity.normalizedText,
      identityKey: identity.identityKey,
      claimType: identity.claimType,
      domain: identity.domain,
      jurisdiction: identity.jurisdiction,
      temporalScope: identity.temporalScope,
      possibleDuplicateOf,
      firstSeenAt: new Date(),
      lastEvaluatedAt: null,
      currentAssessmentVersion: 1,
    });
    return { claim, created: true, matchTier: "new" };
  } catch (err: unknown) {
    logEvent("CLAIM_DIAGNOSTIC_CREATE_FAILED", {
      operation: "Claim.create",
      elapsedMs: Date.now() - createStartedAt,
      ...describeError(err),
    });
    if ((err as { code?: number })?.code === 11000) {
      const existing = await Claim.findOne({ identityKey: identity.identityKey });
      if (!existing) throw err; // duplicate key but no row found is a real, unexpected error
      const matchTier =
        existing.canonicalText.trim().toLowerCase() ===
        identity.canonicalText.trim().toLowerCase()
          ? "exact"
          : "high_confidence";
      return { claim: existing, created: false, matchTier };
    }
    throw err;
  }
}

export type EvidenceForClaim = {
  id: string;
  stance: "supports" | "contradicts" | "context" | "unknown";
  authorityScore: number;
  relevanceScore: number;
  stanceConfidence: number;
  independenceGroup: string;
  sourceType: SourceType;
};

// Everything currently attached to a claim, in the shape lib/evidenceScoring.ts
// needs - one query, reused both for the snapshot's evidenceObjectIds and to
// compute the (optional, best-effort) evidenceAssessment cached on that
// snapshot. Called BEFORE new evidence is persisted for this call, so it's a
// true "what existed prior to this update" read.
export async function getExistingEvidenceForClaim(
  claimId: string
): Promise<EvidenceForClaim[]> {
  const docs = await EvidenceObject.find({ claimId }).select(
    "stance authorityScore relevanceScore stanceConfidence independenceGroup sourceType"
  );
  return docs.map((doc: any) => ({
    id: String(doc._id),
    stance: doc.stance,
    authorityScore: doc.authorityScore,
    relevanceScore: doc.relevanceScore,
    stanceConfidence: doc.stanceConfidence,
    independenceGroup: doc.independenceGroup,
    sourceType: doc.sourceType,
  }));
}

// A claim's evidence was refreshed (a new post triggered a grounding run
// that added at least one genuinely new EvidenceObject for it - see
// lib/evidencePersistence.ts's per-claim dedup). Preserves the version being
// superseded as an immutable ClaimAssessmentSnapshot before advancing -
// "a new piece of evidence updates the assessment without pretending the
// previous one never existed" (Phase 6). Idempotent: if a snapshot for this
// exact (claim, version) already exists (e.g. a retried call), it's left
// alone rather than overwritten.
export async function advanceClaimAssessmentVersion(params: {
  claimId: string;
  priorEvidence: EvidenceForClaim[];
}): Promise<void> {
  const claim = await Claim.findById(params.claimId);
  if (!claim) return;

  const priorEvidenceAssessment: EvidenceAssessment | null =
    params.priorEvidence.length > 0 ? assessEvidenceStrength(params.priorEvidence) : null;

  await ClaimAssessmentSnapshot.findOneAndUpdate(
    { claim: claim._id, assessmentVersion: claim.currentAssessmentVersion },
    {
      $setOnInsert: {
        claim: claim._id,
        assessmentVersion: claim.currentAssessmentVersion,
        evidenceObjectIds: params.priorEvidence.map((item) => item.id),
        evidenceAssessment: priorEvidenceAssessment,
      },
    },
    { upsert: true }
  );

  claim.currentAssessmentVersion += 1;
  claim.lastEvaluatedAt = new Date();
  await claim.save();
}

export async function touchClaimLastEvaluatedAt(claimId: string): Promise<void> {
  await Claim.updateOne({ _id: claimId }, { $set: { lastEvaluatedAt: new Date() } });
}
