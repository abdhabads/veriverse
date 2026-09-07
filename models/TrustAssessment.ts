import { Schema, model, models } from "mongoose";

// One immutable TrustAssessment per (claim, claimAssessmentVersion) - never
// updated in place, mirroring ClaimAssessmentSnapshot's pattern. This is
// deliberately keyed to Claim.currentAssessmentVersion, NOT
// Post.trustDecisionVersion - see the header comment on that distinction in
// lib/trustAssessment.ts. Multiple posts can reference the same
// TrustAssessment (via their claimId + whatever claim assessment version was
// current when their own trust decision was made).
//
// modelVersion exists purely for reproducibility (Phase 8): if the scoring
// logic in lib/evidenceStrength.ts / lib/contradictionStrength.ts /
// lib/verificationConfidence.ts ever changes, old TrustAssessment rows stay
// interpretable as "what version of the algorithm produced this," instead of
// silently being reinterpreted under new logic.
const EvidenceStrengthDimensionSchema = new Schema(
  {
    band: { type: String, required: true },
    score: { type: Number, required: true },
    confidence: { type: Number, required: true },
    independentSupportingCount: { type: Number, required: true },
    reasons: { type: [String], default: [] },
  },
  { _id: false }
);

const ContradictionStrengthDimensionSchema = new Schema(
  {
    band: { type: String, required: true },
    directCount: { type: Number, required: true },
    weakCount: { type: Number, required: true },
    confidence: { type: Number, required: true },
    reasons: { type: [String], default: [] },
  },
  { _id: false }
);

const TrustAssessmentSchema = new Schema(
  {
    claim: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
      index: true,
    },
    // The Claim.currentAssessmentVersion this assessment corresponds to.
    claimAssessmentVersion: {
      type: Number,
      required: true,
      min: 1,
    },

    evidenceStrength: {
      type: EvidenceStrengthDimensionSchema,
      required: true,
    },
    contradictionStrength: {
      type: ContradictionStrengthDimensionSchema,
      required: true,
    },
    verificationConfidence: {
      level: { type: String, required: true },
      score: { type: Number, required: true },
      reasons: { type: [String], default: [] },
    },

    supportingEvidenceIds: {
      type: [Schema.Types.ObjectId],
      ref: "EvidenceObject",
      default: [],
    },
    contradictingEvidenceIds: {
      type: [Schema.Types.ObjectId],
      ref: "EvidenceObject",
      default: [],
    },
    // Evidence that exists but doesn't cleanly fall into either bucket:
    // "context"/"unknown" stance, or a "contradicts"-stanced item that was
    // disqualified (wrong proposition/time/jurisdiction, or too weak to
    // count as a real contradiction) - see lib/contradictionStrength.ts.
    unresolvedEvidenceIds: {
      type: [Schema.Types.ObjectId],
      ref: "EvidenceObject",
      default: [],
    },

    // A structured DESCRIPTIVE label, not a truth verdict - "well_supported"
    // describes the evidence picture, it does not assert the claim is true.
    assessmentBand: {
      type: String,
      enum: [
        "well_supported",
        "weakly_supported",
        "contested",
        "contradicted",
        "insufficient_evidence",
      ],
      required: true,
    },
    assessmentReasons: {
      type: [String],
      default: [],
    },

    modelVersion: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

TrustAssessmentSchema.index({ claim: 1, claimAssessmentVersion: 1 }, { unique: true });

export default models.TrustAssessment || model("TrustAssessment", TrustAssessmentSchema);
