import mongoose, { Schema, model, models } from "mongoose";

const GroundingSourceSchema = new Schema({
  title: { type: String, default: "" },
  url: { type: String, default: "" },
  domain: { type: String, default: "" },
  stance: {
    type: String,
    enum: ["supports", "contradicts", "context", "unknown"],
    default: "unknown",
  },
  stanceEvidence: { type: String, default: null },
  // Sprint 1: optional ref to the structured EvidenceObject this embedded
  // summary was derived from. Additive and backward-compatible - absent on
  // every post created before this sprint, and existing readers of this
  // sub-document (GroundedEvidencePanel, exports) ignore unknown fields.
  evidenceObjectId: {
    type: Schema.Types.ObjectId,
    ref: "EvidenceObject",
    default: null,
  },
}, { _id: false });

// Sprint 1: non-authoritative, explainable evidence summary (see
// lib/evidenceScoring.ts) computed alongside the existing count-based
// verificationScore, not in place of it. Optional/unset on posts created
// before this sprint or whenever evidence persistence failed for a post.
const EvidenceAssessmentSchema = new Schema({
  supportStrength: {
    type: String,
    enum: ["none", "weak", "moderate", "strong"],
  },
  contradictionStrength: {
    type: String,
    enum: ["none", "weak", "moderate", "strong"],
  },
  independentSupportingCount: { type: Number },
  independentContradictingCount: { type: Number },
  supportWeight: { type: Number },
  contradictionWeight: { type: Number },
  explanation: { type: String },
}, { _id: false });

const PostSchema = new Schema({
  author: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  // Sprint 2: the underlying proposition this post asserts (models/Claim.ts),
  // distinct from the post itself - multiple posts can share one claimId.
  // Additive/optional: null for content with nothing to verify (question/
  // instruction) and for every post created before this sprint.
  claimId: {
    type: Schema.Types.ObjectId,
    ref: "Claim",
    default: null,
  },
  status: {
    type: String,
    enum: [
      "unverified",
      "verified",
      "disputed",
      "false",
      "flagged",
      "under_expert_review",
      "under_appeal_review",
    ],
    default: "unverified",
  },
  aiLabel: {
    type: String,
    enum: ["safe", "suspicious", "needs_review", "high_risk"],
    default: "safe",
  },
  aiRiskScore: {
    type: Number,
    default: 0,
  },
  verificationScore: {
    type: Number,
    default: 0,
  },
  moderationReasons: {
    type: [String],
    default: [],
  },
  hashtags: {
    type: [String],
    default: [],
  },
  accurateVotes: {
    type: Number,
    default: 0,
  },
  inaccurateVotes: {
    type: Number,
    default: 0,
  },
  accurateWeight: {
    type: Number,
    default: 0,
  },
  inaccurateWeight: {
    type: Number,
    default: 0,
  },
  likesCount: {
    type: Number,
    default: 0,
  },
  repostsCount: {
    type: Number,
    default: 0,
  },
  needsExpertReview: {
    type: Boolean,
    default: false,
  },
  expertDecision: {
    type: String,
    enum: ["", "verified", "false", "disputed"],
    default: "",
  },
  expertReviewedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  appealCount: {
    type: Number,
    default: 0,
  },
  finalized: {
    type: Boolean,
    default: false,
  },
  finalizedAt: {
    type: Date,
    default: null,
  },
  groundingStatus: {
    type: String,
    enum: ["not_checked", "checked", "insufficient_evidence"],
    default: "not_checked",
  },
  groundingSummary: {
    type: String,
    default: "",
    trim: true,
    maxlength: 500,
  },
  groundingSources: {
    type: [GroundingSourceSchema],
    default: [],
  },
  evidenceAssessment: {
    type: EvidenceAssessmentSchema,
    default: undefined,
  },
  groundingConfidence: {
    type: Number,
    default: 0,
  },
  contradictionCount: {
    type: Number,
    default: 0,
  },
  supportCount: {
    type: Number,
    default: 0,
  },
  contentType: {
    type: String,
    enum: ["claim", "question", "instruction", "rhetorical_claim"],
    default: "claim",
  },
  extractedClaim: {
    type: String,
    default: null,
  },
  aiProvider: {
    type: String,
    default: "",
    trim: true,
  },
  trustDecisionVersion: {
    type: Number,
    default: 1,
    min: 1,
  },
  trustEvaluationState: {
    type: String,
    enum: ["pending", "evaluated", "finalized", "reopened"],
    default: "pending",
  },
  lastTrustEvaluatedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

    PostSchema.index({ status: 1, createdAt: -1 });
    PostSchema.index({ aiRiskScore: -1, createdAt: -1 });
    PostSchema.index({ verificationScore: -1, createdAt: -1 });
    PostSchema.index({ author: 1, createdAt: -1 });
    PostSchema.index({ hashtags: 1 });
    PostSchema.index({ needsExpertReview: 1, finalized: 1, createdAt: -1 });
    PostSchema.index({ trustDecisionVersion: 1 });
    PostSchema.index({ trustEvaluationState: 1, createdAt: -1 });

    export default models.Post || model("Post", PostSchema);
