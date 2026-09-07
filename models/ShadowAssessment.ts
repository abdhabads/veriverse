import { Schema, model, models } from "mongoose";

// Sprint "Shadow Mode Implementation" — the dedicated, non-authoritative
// collection specified in docs/SHADOW_MODE_CONTRACT.md §3. Deliberately NOT
// an extension of TrustAssessment (§3's own reasoning) and deliberately
// carries no `postId`/`userId` field so it can never be discovered from a
// Post-adjacent query (§3, §4's prohibited-side-effects table) - `claimId`
// is the only reference, matching EvidenceObject/Claim/TrustAssessment's
// existing no-Post-FK design (confirmed in Sprint 6.75.5's retention
// investigation).
//
// One record per SUCCESSFUL shadow computation only - a `no_claim` or
// exception outcome is audit-logged (lib/shadowMode.ts, via lib/logger.ts)
// but never persisted here, per contract §5 ("produces no ShadowAssessment
// record") and §2 (the record shape describes a real judgment, not a
// failure placeholder).
//
// `expiresAt` is deliberately NOT set at write time - see contract §9 and
// docs/SHADOW_MODE_POLICY_DECISIONS.md item 6: retention is tied to the
// observation phase's conclusion (a single, global event), not a per-record
// duration, so `expiresAt` stays absent until
// lib/shadowMode.ts's markObservationCompleteAndBackfillRetention() stamps
// it on every existing record in one pass. The TTL index below is inert
// (matches nothing) until that happens - the same expireAfterSeconds:0
// mechanism GroundingCache already uses, just populated later.
const SidedProfileSnapshotSchema = new Schema(
  {
    itemCount: { type: Number, required: true },
    meaningfulIndependentGroupCount: { type: Number, required: true },
    qualityTier: { type: String, required: true },
    bestItemScore: { type: Number, default: null },
  },
  { _id: false }
);

const ShadowAssessmentSchema = new Schema(
  {
    claimId: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
    },
    // The specific EvidenceObject documents this computation read - required
    // for exact replay (contract §6), the same discipline Sprint 5.6's
    // sanityMismatches:0 replay check depended on.
    evidenceObjectIds: {
      type: [Schema.Types.ObjectId],
      ref: "EvidenceObject",
      default: [],
    },

    modelVersion: { type: String, required: true },

    conflictCategory: { type: String, required: true },
    evidenceState: { type: String, required: true },
    assessmentBand: {
      type: String,
      enum: ["well_supported", "weakly_supported", "contested", "contradicted", "insufficient_evidence"],
      required: true,
    },

    supportProfile: { type: SidedProfileSnapshotSchema, required: true },
    contradictionProfile: { type: SidedProfileSnapshotSchema, required: true },

    // True when this record's support AND contradiction sides both have at
    // least one evidence item - the "genuine mixed-stance evidence"
    // condition contract §12 counts toward the 100-case bar (matching
    // Sprint 6.75.1's original definition: both supporting and contradicting
    // evidence present).
    isMixedStance: { type: Boolean, required: true },

    // Comparison against the production verdict already computed for this
    // claim at the same moment (contract §2) - production is never
    // recomputed or re-read here, only the band already returned by
    // buildAndPersistTrustAssessment in the same pipeline run is recorded.
    productionBand: {
      type: String,
      enum: ["well_supported", "weakly_supported", "contested", "contradicted", "insufficient_evidence"],
      required: true,
    },
    agreesWithProduction: { type: Boolean, required: true },
    dangerTier: { type: String, required: true },
    dangerWeight: { type: Number, required: true },
    // Precomputed per contract §11's exact definition (dangerTier ===
    // "dangerously_wrong") so the rolling-window monitor can query this
    // field directly instead of re-deriving it per read.
    isDangerousDisagreement: { type: Boolean, required: true },

    // Populated only by the observation-conclusion backfill (contract §9).
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// claimId only - deliberately no postId/userId index, per §3.
ShadowAssessmentSchema.index({ claimId: 1 });
// Supports the rolling-window disagreement monitor (most recent N) and the
// completion-criteria total/mixed-stance counts.
ShadowAssessmentSchema.index({ createdAt: -1 });
ShadowAssessmentSchema.index({ isMixedStance: 1, createdAt: -1 });
// The GroundingCache TTL precedent (models/GroundingCache.ts:26), reused
// unchanged - inert until expiresAt is populated by the backfill.
ShadowAssessmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default models.ShadowAssessment || model("ShadowAssessment", ShadowAssessmentSchema);
