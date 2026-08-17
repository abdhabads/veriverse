import mongoose, { Schema, model, models } from "mongoose";

const UserRelationSchema = new Schema(
  {
    sourceUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relationType: {
      type: String,
      enum: ["block", "mute"],
      required: true,
    },
  },
  { timestamps: true }
);

UserRelationSchema.index(
  { sourceUser: 1, targetUser: 1, relationType: 1 },
  { unique: true }
);

export default models.UserRelation ||
  model("UserRelation", UserRelationSchema);
