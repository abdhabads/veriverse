import mongoose, { Schema, model, models } from "mongoose";

const AppealSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    appellant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected"],
      default: "pending",
    },
    resolutionNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

AppealSchema.index({ post: 1, appellant: 1 }, { unique: true });
AppealSchema.index({ status: 1, createdAt: -1 });
AppealSchema.index({ appellant: 1, createdAt: -1 });

export default models.Appeal || model("Appeal", AppealSchema);
