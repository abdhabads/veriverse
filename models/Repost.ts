import mongoose, { Schema, model, models } from "mongoose";

const RepostSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
  },
  { timestamps: true }
);

RepostSchema.index({ user: 1, post: 1 }, { unique: true });

export default models.Repost || model("Repost", RepostSchema);
