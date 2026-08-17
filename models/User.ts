import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    avatarUrl: {
      type: String,
      default: "",
      trim: true,
    },
    reputation: {
      type: Number,
      default: 0,
    },
    rewardPoints: {
      type: Number,
      default: 0,
    },
    badges: {
      type: [String],
      default: [],
    },
    role: {
      type: String,
      enum: ["user", "admin", "expert"],
      default: "user",
    },
    expertCategory: {
      type: String,
      default: "",
      trim: true,
    },
    interests: {
      type: [String],
      default: [],
    },
    riskScore: {
      type: Number,
      default: 0,
    },
    suspiciousFlags: {
      type: Number,
      default: 0,
    },
    lastVoteAt: {
      type: Date,
      default: null,
    },
    dailyVoteCount: {
      type: Number,
      default: 0,
    },
    dailyVoteCountDate: {
      type: String,
      default: "",
    },

    moderationStatus: {
      type: String,
      enum: ["active", "warned", "suspended", "banned"],
      default: "active",
    },
    moderationNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    suspendedUntil: {
      type: Date,
      default: null,
    },
    warnedAt: {
      type: Date,
      default: null,
    },
    bannedAt: {
      type: Date,
      default: null,
    },
    isDeactivated: {
      type: Boolean,
      default: false,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deletionEligibleAt: {
      type: Date,
      default: null,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    passwordResetTokenHash: {
      type: String,
      default: "",
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserSchema.index({ moderationStatus: 1, createdAt: -1 });
UserSchema.index({ role: 1, createdAt: -1 });

export default models.User || model("User", UserSchema);
