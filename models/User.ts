import { Schema, model, models } from "mongoose";
import { EXPERTISE_DOMAINS } from "@/lib/expertiseDomains";

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
    // P3.6: which subject domain(s) an expert-role user's recognized
    // expertise covers - additive to `role`, never a replacement for it.
    // Only meaningful when role === "expert"; admin-assigned only (see
    // app/api/admin/users/[id]/route.ts's set_expertise action), never
    // self-declared via app/api/profile/route.ts. Reuses Claim's own
    // `domain` vocabulary (lib/expertiseDomains.ts) rather than a second
    // taxonomy.
    expertiseDomains: {
      type: [String],
      enum: EXPERTISE_DOMAINS,
      default: [],
    },
    // Short, admin-authored context explaining the recognized expertise
    // (e.g. "Practicing physician, 12 years") - never a document/file, and
    // never a review score or trust signal. Same length convention as bio.
    expertCredentialSummary: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
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
    termsAcceptedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserSchema.index({ moderationStatus: 1, createdAt: -1 });
UserSchema.index({ role: 1, createdAt: -1 });

export default models.User || model("User", UserSchema);
