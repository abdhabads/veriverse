import mongoose, { Schema, model, models } from "mongoose";

const SavedPostSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
  },
  { timestamps: true }
);

SavedPostSchema.index({ user: 1, post: 1 }, { unique: true });

export default models.SavedPost || model("SavedPost", SavedPostSchema);
