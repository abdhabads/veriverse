import mongoose, { Schema, model, models } from "mongoose";

const NotificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "post_verified",
        "post_flagged",
        "vote_reward",
        "vote_penalty",
        "comment_received",
        "report_update",
        "message_received",
        "new_follower",
        "repost_received",
        // P3.4: system/Claim-originated, not another user's action - fits
        // the existing schema unchanged, since no notification type here
        // has ever had a separate "actor" field; the who/what is already
        // baked into `message`, same as every type above.
        "claim_updated",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    referencePost: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    referenceConversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    // P3.4: both additive/optional, unset on every notification type that
    // predates this phase.
    referenceClaim: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      default: null,
    },
    referenceClaimChangeEvent: {
      type: Schema.Types.ObjectId,
      ref: "ClaimChangeEvent",
      default: null,
    },
  },
  { timestamps: true }
);

// P3.4: delivery dedup for Claim-change notifications only. The predicate
// selects documents whose referenceClaimChangeEvent is an actual ObjectId
// (verified locally against this project's MongoDB/Mongoose versions),
// deliberately not `{$exists:true, $ne:null}` - every pre-P3.4 notification
// type leaves this field unset and must never be constrained by this index.
NotificationSchema.index(
  { user: 1, referenceClaimChangeEvent: 1 },
  {
    unique: true,
    partialFilterExpression: { referenceClaimChangeEvent: { $type: "objectId" } },
  }
);

export default models.Notification ||
  model("Notification", NotificationSchema);