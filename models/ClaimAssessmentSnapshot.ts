import { Schema, model, models } from "mongoose";

// Mirrors models/PostTrustSnapshot.ts's pattern (immutable, version-keyed
// history), scoped to a Claim instead of a Post. Preserves "what evidence did
// this claim have" at each assessment version so a new piece of evidence
// updating the claim never silently erases what the previous version looked
// like. Deliberately does NOT store a computed verdict (true/false/etc.) -
// that redesign is later-sprint work; this only preserves the evidence set
// and the Sprint 1 evidenceAssessment computed from it.
const ClaimAssessmentSnapshotSchema = new Schema(
  {
    claim: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
      index: true,
    },
    assessmentVersion: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    evidenceObjectIds: {
      type: [Schema.Types.ObjectId],
      ref: "EvidenceObject",
      default: [],
    },
    evidenceAssessment: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

ClaimAssessmentSnapshotSchema.index(
  { claim: 1, assessmentVersion: 1 },
  { unique: true }
);

export default models.ClaimAssessmentSnapshot ||
  model("ClaimAssessmentSnapshot", ClaimAssessmentSnapshotSchema);
