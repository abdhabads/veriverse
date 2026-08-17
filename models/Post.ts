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
