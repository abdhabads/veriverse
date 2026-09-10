import mongoose, { Schema, model, models } from "mongoose";

const ReferralSchema = new Schema(
  {
    referrer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referredUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["joined", "activated"],
      default: "joined",
    },
    activatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

ReferralSchema.index({ referrer: 1, status: 1 });

export default models.Referral || model("Referral", ReferralSchema);
