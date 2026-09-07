import { Schema, model, models } from "mongoose";

// One independently-verifiable proposition extracted from a Claim's text.
// A non-compound claim has exactly one ClaimComponent, whose propositionText
// mirrors the whole claim; a compound claim ("X did A and did B") has one
// per detected independent proposition - see lib/propositionExtraction.ts.
//
// Immutable once created, like ClaimAssessmentSnapshot/TrustAssessment: a
// re-extraction under a new propositionSchemaVersion produces NEW rows, it
// never rewrites existing ones (Phase 13 - historical reproducibility).
// Deliberately does NOT bump Claim.currentAssessmentVersion - proposition
// extraction improving is a different kind of change than new evidence
// arriving, and coupling them would make historical TrustAssessments harder
// to interpret, not easier. See the Sprint 4 report for the full reasoning.
const ExtractedFieldSchema = new Schema(
  {
    value: { type: Schema.Types.Mixed, default: null },
    confidence: { type: Number, required: true },
    method: {
      type: String,
      enum: ["deterministic", "ai_assisted", "unresolved"],
      required: true,
    },
    sourceTextSpan: {
      start: { type: Number },
      end: { type: Number },
      _id: false,
    },
  },
  { _id: false }
);

const EntityMentionSchema = new Schema(
  {
    text: { type: String, required: true },
    span: {
      start: { type: Number, required: true },
      end: { type: Number, required: true },
      _id: false,
    },
    resolved: { type: Boolean, required: true },
    entityType: {
      type: String,
      enum: ["place", "organization", "unknown"],
      required: true,
    },
    entityId: { type: String, default: null },
  },
  { _id: false }
);

const ClaimComponentSchema = new Schema(
  {
    claim: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
      index: true,
    },
    componentIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    propositionText: {
      type: String,
      required: true,
    },
    sourceTextSpan: {
      start: { type: Number, required: true },
      end: { type: Number, required: true },
      _id: false,
    },

    subject: { type: ExtractedFieldSchema, required: true },
    predicate: { type: ExtractedFieldSchema, required: true },
    object: { type: ExtractedFieldSchema, required: true },
    entities: { type: [EntityMentionSchema], default: [] },
    quantity: { type: ExtractedFieldSchema, required: true },
    negation: { type: ExtractedFieldSchema, required: true },
    attribution: { type: ExtractedFieldSchema, required: true },
    modality: { type: ExtractedFieldSchema, required: true },
    conditionality: { type: ExtractedFieldSchema, required: true },

    temporalScope: {
      type: {
        type: String,
        enum: ["unspecified", "relative", "specific"],
        default: "unspecified",
      },
      value: { type: String, default: null },
      _id: false,
    },
    jurisdiction: { type: String, default: null },

    // Phase 13 reproducibility - see the file header.
    extractionModelVersion: { type: String, required: true },
    normalizationVersion: { type: String, required: true },
    propositionSchemaVersion: { type: String, required: true },
  },
  { timestamps: true }
);

ClaimComponentSchema.index(
  { claim: 1, propositionSchemaVersion: 1, componentIndex: 1 },
  { unique: true }
);

export default models.ClaimComponent || model("ClaimComponent", ClaimComponentSchema);
