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
  },
  { timestamps: true }
);

export default models.Notification ||
  model("Notification", NotificationSchema);