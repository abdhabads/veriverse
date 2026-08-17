import mongoose, { Schema, model, models } from "mongoose";

const RewardLogSchema = new Schema(
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
        "correct_vote",
        "incorrect_vote_penalty",
        "false_post_penalty",
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

export default models.RewardLog || model("RewardLog", RewardLogSchema);