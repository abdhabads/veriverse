import { Schema, model, models } from "mongoose";

const TrustEventSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },

    eventKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    eventType: {
      type: String,
      enum: [
        "community_finalize_verified",
        "community_finalize_false",
        "community_finalize_disputed",
        "expert_finalize_verified",
        "expert_finalize_false",
        "expert_finalize_disputed",
        "appeal_approved_reopen",
        "contradiction_forced",
        "evidence_deescalated",
        "content_classified_non_claim",
        "appeal_rejected",
        "edit_reopen",
      ],
      required: true,
      index: true,
    },

    trustDecisionVersion: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },

    applied: {
      type: Boolean,
      default: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

TrustEventSchema.index({ post: 1, trustDecisionVersion: 1, eventType: 1 });

export default models.TrustEvent || model("TrustEvent", TrustEventSchema);
