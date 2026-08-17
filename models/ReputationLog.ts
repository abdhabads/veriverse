import mongoose, { Schema, model, models } from "mongoose";

const ReputationLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actionType: {
      type: String,
      enum: [
        "accurate_post",
        "false_post_penalty",
        "correct_vote",
        "incorrect_vote_penalty",
        "expert_verified_post",
        "expert_false_post_penalty",
        "abuse_penalty",
        "admin_adjustment",
        "appeal_reversal",
        "trust_reconciliation",
      ],
      required: true,
    },
    pointsChange: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    referencePost: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    trustDecisionVersion: {
      type: Number,
      default: 1,
    },
    trustEventKey: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

export default models.ReputationLog ||
  model("ReputationLog", ReputationLogSchema);
