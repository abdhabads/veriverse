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
  },
  { timestamps: true }
);

PostTrustSnapshotSchema.index({ post: 1, trustDecisionVersion: 1 }, { unique: true });

export default models.PostTrustSnapshot ||
  model("PostTrustSnapshot", PostTrustSnapshotSchema);
