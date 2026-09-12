import mongoose, { Schema, model, models } from "mongoose";

// P3.3: the subscription primitive a user follows a Claim through -
// deliberately separate from models/Follow.ts (person-to-person) rather than
// a polymorphic extension of it. No status enum, notification-preference
// field, mute field, or delivery state - P3.4 owns Claim-change notification
// behavior; this model stores only the relation itself.
const ClaimFollowSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    claim: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
    },
  },
  { timestamps: true }
);

ClaimFollowSchema.index({ user: 1, claim: 1 }, { unique: true });
// Serves follower-count reads today and the future P3.4 fanout query
// ("find every user following this Claim") - no other index is justified by
// a real access pattern yet.
ClaimFollowSchema.index({ claim: 1 });

export default models.ClaimFollow || model("ClaimFollow", ClaimFollowSchema);
