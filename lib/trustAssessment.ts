import Claim from "@/models/Claim";
import EvidenceObject from "@/models/EvidenceObject";
import TrustAssessment from "@/models/TrustAssessment";
import {
  assessClaimEvidenceStrength,
  assessEvidenceItemStrength,
  EvidenceStrengthInput,
  ClaimEvidenceStrengthResult,
} from "@/lib/evidenceStrength";
import {
  assessClaimContradictionStrength,
  classifyContradictionTier,
  ClaimContradictionStrengthResult,
} from "@/lib/contradictionStrength";
import { assessVerificationConfidence, VerificationConfidenceResult } from "@/lib/verificationConfidence";
import { countDistinctGroups } from "@/lib/sourceIndependence";
import { TemporalScope } from "@/lib/claimNormalization";

// Bump this whenever the scoring logic in evidenceStrength.ts /
// contradictionStrength.ts / verificationConfidence.ts changes meaningfully -
// see models/TrustAssessment.ts's header on why (Phase 8 reproducibility).
export const TRUST_ASSESSMENT_MODEL_VERSION = "trust-assessment-v1";

export type AssessmentBand =
  | "well_supported"
  | "weakly_supported"
  | "contested"
  | "contradicted"
  | "insufficient_evidence";

// A DESCRIPTIVE label for the shape of the evidence, not a truth verdict -
// "well_supported" describes what was found, it does not assert the claim
// is true. Deliberately not wired to Post.status or any decision this
// sprint - see the additive/compatibility framing in the Sprint 3 report.
function determineAssessmentBand(
  evidenceStrength: ClaimEvidenceStrengthResult,
  contradictionStrength: ClaimContradictionStrengthResult
): { band: AssessmentBand; reason: string } {
  const hasMeaningfulSupport = evidenceStrength.band !== "negligible";
  const hasSubstantialSupport = evidenceStrength.band === "strong" || evidenceStrength.band === "moderate";
  const hasSubstantialContradiction =
    contradictionStrength.band === "strong" || contradictionStrength.band === "moderate";
  const hasAnyContradiction = contradictionStrength.band !== "none";

  if (!hasMeaningfulSupport && !hasAnyContradiction) {
    return { band: "insufficient_evidence", reason: "No meaningful supporting or contradicting evidence found." };
  }

  if (hasSubstantialContradiction) {
    if (hasSubstantialSupport) {
      return { band: "contested", reason: "Both substantial supporting and substantial contradicting evidence exist." };
    }
    return { band: "contradicted", reason: "Substantial contradiction with no substantial supporting evidence." };
  }

  if (hasMeaningfulSupport) {
    return evidenceStrength.band === "strong"
      ? { band: "well_supported", reason: "Strong, independently corroborated supporting evidence with no substantial contradiction." }
      : { band: "weakly_supported", reason: "Some supporting evidence exists but is not yet strong or independently corroborated." };
  }

  return { band: "insufficient_evidence", reason: "Only weak/indirect contradiction signals; no meaningful support." };
}

export type EvidenceRow = EvidenceStrengthInput & { id: string };

export async function loadEvidenceForClaim(claimId: string): Promise<EvidenceRow[]> {
  const docs = await EvidenceObject.find({ claimId }).select(
    "stance authorityScore relevanceScore stanceConfidence independenceGroup sourceType publishedAt evidenceText"
  );
  return docs.map((doc: any) => ({
    id: String(doc._id),
    stance: doc.stance,
    authorityScore: doc.authorityScore,
    relevanceScore: doc.relevanceScore,
    stanceConfidence: doc.stanceConfidence,
    independenceGroup: doc.independenceGroup,
    sourceType: doc.sourceType,
    publishedAt: doc.publishedAt,
    evidenceText: doc.evidenceText,
  }));
}

export type TrustAssessmentComputation = {
  evidenceStrength: ClaimEvidenceStrengthResult;
  contradictionStrength: ClaimContradictionStrengthResult;
  verificationConfidence: VerificationConfidenceResult;
  assessmentBand: AssessmentBand;
  assessmentReasons: string[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unresolvedEvidenceIds: string[];
};

// Fully pure: given evidence rows and claim context already in hand, no DB
// access at all. Split out so a diagnostic/replay script (e.g. Sprint 5.6's
// deterministic re-scoring of Sprint 5's stored evidence under a corrected
// lib/sourceAuthority.ts) can reuse the EXACT production scoring logic
// against substituted inputs, instead of re-implementing it and risking
// drift. computeTrustAssessment below is a thin DB-loading wrapper around
// this.
export function computeTrustAssessmentFromEvidence(
  items: EvidenceRow[],
  claimContext: { temporalScope: TemporalScope; jurisdiction: string | null }
): TrustAssessmentComputation {
  const evidenceStrength = assessClaimEvidenceStrength(items, claimContext);
  const contradictionStrength = assessClaimContradictionStrength(items, claimContext);
  const totalIndependentGroups = countDistinctGroups(items.map((item) => item.independenceGroup));

  const verificationConfidence = assessVerificationConfidence({
    evidenceStrength,
    contradictionStrength,
    totalIndependentGroups,
    groundingStatus: items.length > 0 ? "checked" : "insufficient_evidence",
  });

  const groupSizes = new Map<string, number>();
  for (const item of items) {
    groupSizes.set(item.independenceGroup, (groupSizes.get(item.independenceGroup) || 0) + 1);
  }

  const supportingEvidenceIds: string[] = [];
  const contradictingEvidenceIds: string[] = [];
  const unresolvedEvidenceIds: string[] = [];

  for (const item of items) {
    if (item.stance === "supports") {
      supportingEvidenceIds.push(item.id);
      continue;
    }
    if (item.stance === "contradicts") {
      const strength = assessEvidenceItemStrength(
        item,
        groupSizes.get(item.independenceGroup) || 1,
        claimContext
      );
      const tier = classifyContradictionTier(item, strength);
      if (tier === "no_contradiction") {
        unresolvedEvidenceIds.push(item.id);
      } else {
        contradictingEvidenceIds.push(item.id);
      }
      continue;
    }
    unresolvedEvidenceIds.push(item.id);
  }

  const { band: assessmentBand, reason: bandReason } = determineAssessmentBand(
    evidenceStrength,
    contradictionStrength
  );

  const assessmentReasons = [
    bandReason,
    ...evidenceStrength.reasons,
    ...contradictionStrength.reasons,
    ...verificationConfidence.reasons,
  ];

  return {
    evidenceStrength,
    contradictionStrength,
    verificationConfidence,
    assessmentBand,
    assessmentReasons,
    supportingEvidenceIds,
    contradictingEvidenceIds,
    unresolvedEvidenceIds,
  };
}

// DB-loading wrapper around computeTrustAssessmentFromEvidence - the only
// place in this file that touches the database (one read for the claim,
// one for its evidence, no writes).
export async function computeTrustAssessment(claimId: string): Promise<TrustAssessmentComputation> {
  const claim = await Claim.findById(claimId);
  const claimContext = {
    temporalScope: claim?.temporalScope ?? { type: "unspecified" as const, value: null },
    jurisdiction: claim?.jurisdiction ?? null,
  };
  const items = await loadEvidenceForClaim(claimId);
  return computeTrustAssessmentFromEvidence(items, claimContext);
}

// Idempotent: (claim, claimAssessmentVersion) is uniquely indexed, so a
// retried call for a version that already has an assessment returns the
// existing row rather than erroring or duplicating it.
export async function buildAndPersistTrustAssessment(claimId: string): Promise<any> {
  const claim = await Claim.findById(claimId);
  if (!claim) return null;

  const computation = await computeTrustAssessment(claimId);

  try {
    return await TrustAssessment.create({
      claim: claim._id,
      claimAssessmentVersion: claim.currentAssessmentVersion,
      evidenceStrength: {
        band: computation.evidenceStrength.band,
        score: computation.evidenceStrength.score,
        confidence: computation.evidenceStrength.confidence,
        independentSupportingCount: computation.evidenceStrength.independentSupportingCount,
        reasons: computation.evidenceStrength.reasons,
      },
      contradictionStrength: {
        band: computation.contradictionStrength.band,
        directCount: computation.contradictionStrength.directCount,
        weakCount: computation.contradictionStrength.weakCount,
        confidence: computation.contradictionStrength.confidence,
        reasons: computation.contradictionStrength.reasons,
      },
      verificationConfidence: {
        level: computation.verificationConfidence.level,
        score: computation.verificationConfidence.score,
        reasons: computation.verificationConfidence.reasons,
      },
      supportingEvidenceIds: computation.supportingEvidenceIds,
      contradictingEvidenceIds: computation.contradictingEvidenceIds,
      unresolvedEvidenceIds: computation.unresolvedEvidenceIds,
      assessmentBand: computation.assessmentBand,
      assessmentReasons: computation.assessmentReasons,
      modelVersion: TRUST_ASSESSMENT_MODEL_VERSION,
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      return await TrustAssessment.findOne({
        claim: claim._id,
        claimAssessmentVersion: claim.currentAssessmentVersion,
      });
    }
    throw err;
  }
}
