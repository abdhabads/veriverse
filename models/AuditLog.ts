import { Schema, model, models } from "mongoose";

const AuditLogSchema = new Schema(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorRole: {
      type: String,
      enum: ["admin", "expert"],
      required: true,
    },
    actionType: {
      type: String,
      enum: [
        "report_flag_post",
        "report_dismiss",
        "appeal_approved",
        "appeal_rejected",
        "expert_verified",
        "expert_false",
        "expert_disputed",
        "admin_user_warned",
        "admin_user_suspended",
        "admin_user_banned",
        "admin_user_reactivated",
        "admin_user_adjustment",
        "admin_role_assigned",
      ],
      required: true,
    },
    targetPost: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    targetAppeal: {
      type: Schema.Types.ObjectId,
      ref: "Appeal",
      default: null,
    },
    targetReport: {
      type: Schema.Types.ObjectId,
      ref: "Report",
      default: null,
    },
    targetUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ actionType: 1, createdAt: -1 });

export default models.AuditLog || model("AuditLog", AuditLogSchema);
