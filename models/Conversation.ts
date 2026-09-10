import mongoose, { Schema, model, models } from "mongoose";

const ParticipantStateSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const ConversationSchema = new Schema(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length === 2,
        message: "A conversation must have exactly two participants",
      },
    },
    participantKey: {
      type: String,
      required: true,
      unique: true,
    },
    participantState: {
      type: [ParticipantStateSchema],
      default: [],
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

ConversationSchema.index({ "participantState.user": 1, lastMessageAt: -1 });

export default models.Conversation || model("Conversation", ConversationSchema);
