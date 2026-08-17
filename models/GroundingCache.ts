import { Schema, model, models } from "mongoose";

const GroundingCacheSchema = new Schema(
  {
    contentHash: {
      type: String,
      required: true,
      unique: true,
    },
    contentPreview: {
      type: String,
      default: "",
    },
    result: {
      type: Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

GroundingCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default models.GroundingCache ||
  model("GroundingCache", GroundingCacheSchema);