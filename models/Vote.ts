import mongoose, { Schema, model, models } from "mongoose";

const VoteSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    voteType: {
      type: String,
      enum: ["accurate", "inaccurate"],
      required: true,
    },
    weight: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

VoteSchema.index({ post: 1, user: 1 }, { unique: true });

export default models.Vote || model("Vote", VoteSchema);
