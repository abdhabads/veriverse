import { Schema, model, models } from "mongoose";

const PostTrustSnapshotSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

    trustDecisionVersion: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      required: true,
    },

    aiLabel: {
      type: String,
      default: "",
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

    needsExpertReview: {
      type: Boolean,
      default: false,
    },

    expertDecision: {
      type: String,
      default: "",
    },

    finalized: {
      type: Boolean,
      default: false,
    },

    finalizedAt: {
      type: Date,
      default: null,
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

    groundingStatus: {
      type: String,
      default: "not_checked",
    },

    groundingSummary: {
      type: String,
      default: "",
    },

    groundingSources: {
      type: [Schema.Types.Mixed],
      default: [],
    },

    trustEvaluationState: {
      type: String,
      default: "pending",
    },

    // Sprint 3 (Phase 7/8): cross-reference to the Claim assessment that was
    // CURRENT at the moment this post-level snapshot was taken - deliberately
    // NOT the same number as trustDecisionVersion above. A claim can advance
    // through many assessment versions between two of a post's own trust
    // decisions (or vice versa: many posts can reference the same claim
    // assessment version). This is what lets a historical PostTrustSnapshot
    // stay reproducible even after the claim receives new evidence later -
    // see lib/trustAssessment.ts and the Sprint 3 report's Phase 7 section.
    // All additive/optional: null for snapshots taken before this sprint or
    // for posts with no claimId at all.
    claimId: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      default: null,
    },
    claimAssessmentVersionAtSnapshot: {
      type: Number,
      default: null,
    },
    trustAssessmentId: {
      type: Schema.Types.ObjectId,
      ref: "TrustAssessment",
      default: null,
    },
  },
  { timestamps: true }
);

PostTrustSnapshotSchema.index({ post: 1, trustDecisionVersion: 1 }, { unique: true });

export default models.PostTrustSnapshot ||
  model("PostTrustSnapshot", PostTrustSnapshotSchema);
