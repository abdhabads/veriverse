import { connectDB } from "@/lib/mongodb";
import { requireActiveUser } from "@/lib/auth";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import Notification from "@/models/Notification";
import { cleanOptionalString, isValidObjectId } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";
import { EXPERTISE_DOMAINS, isExpertiseDomain } from "@/lib/expertiseDomains";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const admin = guard.user;

    if (admin.role !== "admin") {
      return fail("Admin access required", 403);
    }

    const { id } = await context.params;
    if (!isValidObjectId(id)) {
      return fail("Invalid user ID", 400);
    }

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return fail("Invalid JSON in request body", 400);
    }
    const action = typeof body.action === "string" ? body.action : "";
    const role = typeof body.role === "string" ? body.role : "";
    const expertiseDomains = Array.isArray(body.expertiseDomains) ? body.expertiseDomains : [];
    const credentialSummary = cleanOptionalString(body.credentialSummary, { maxLength: 300 });
    const note = cleanOptionalString(body.note, { maxLength: 1000 });
    const suspendHours =
      typeof body.suspendHours === "number" && body.suspendHours > 0
        ? body.suspendHours
        : 24;

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return fail("User not found", 404);
    }

    if (String(targetUser._id) === String(admin._id)) {
      return fail("You cannot moderate your own account", 400);
    }

    if (targetUser.role === "admin") {
      return fail("You cannot modify another admin through this route", 403);
    }

    if (action === "set_role") {
      if (!["user", "expert", "admin"].includes(role)) {
        return fail("Invalid role", 400);
      }

      const previousRole = targetUser.role;
      targetUser.role = role;
      await targetUser.save();

      await AuditLog.create({
        actor: admin._id,
        actorRole: admin.role,
        actionType: "admin_role_assigned",
        targetUser: targetUser._id,
        note: note || `Admin changed role for ${targetUser.username} from ${previousRole} to ${role}.`,
      });

      await Notification.create({
        user: targetUser._id,
        type: "report_update",
        message: `Your account role has been updated to ${role}.`,
      });

      return ok({
        message: "User role updated successfully",
        user: {
          _id: targetUser._id,
          username: targetUser.username,
          role: targetUser.role,
        },
      });
    }

    // P3.6: domain-scoped expert identity is admin-assigned only, through
    // this same authorized/self-protected route - never through
    // app/api/profile/route.ts (which does not accept these fields at all),
    // so a user can never self-certify their own expertise. Requires the
    // target to already be (or be becoming, via a prior set_role call) an
    // expert - expertise metadata on a non-expert user would be orphaned
    // and misleading.
    if (action === "set_expertise") {
      if (targetUser.role !== "expert") {
        return fail("User must have the expert role before expertise domains can be assigned", 400);
      }

      if (!expertiseDomains.every(isExpertiseDomain)) {
        return fail(`Invalid expertise domain - must be one of: ${EXPERTISE_DOMAINS.join(", ")}`, 400);
      }

      targetUser.expertiseDomains = expertiseDomains;
      targetUser.expertCredentialSummary = credentialSummary;
      await targetUser.save();

      await AuditLog.create({
        actor: admin._id,
        actorRole: admin.role,
        actionType: "admin_expertise_assigned",
        targetUser: targetUser._id,
        note:
          note ||
          `Admin set expertise domains for ${targetUser.username} to [${expertiseDomains.join(", ")}].`,
      });

      return ok({
        message: "User expertise updated successfully",
        user: {
          _id: targetUser._id,
          username: targetUser.username,
          expertiseDomains: targetUser.expertiseDomains,
          expertCredentialSummary: targetUser.expertCredentialSummary,
        },
      });
    }

    if (!["warn", "suspend", "ban", "reactivate"].includes(action)) {
      return fail("Invalid moderation action", 400);
    }

    let auditActionType:
      | "admin_user_warned"
      | "admin_user_suspended"
      | "admin_user_banned"
      | "admin_user_reactivated";

    if (action === "warn") {
      targetUser.moderationStatus = "warned";
      targetUser.moderationNote = note;
      targetUser.warnedAt = new Date();
      auditActionType = "admin_user_warned";

      await Notification.create({
        user: targetUser._id,
        type: "report_update",
        message: "Your account has received an admin warning.",
      });
    } else if (action === "suspend") {
      const suspendedUntil = new Date(Date.now() + suspendHours * 60 * 60 * 1000);
      targetUser.moderationStatus = "suspended";
      targetUser.moderationNote = note;
      targetUser.suspendedUntil = suspendedUntil;
      auditActionType = "admin_user_suspended";

      await Notification.create({
        user: targetUser._id,
        type: "report_update",
        message: `Your account has been suspended until ${suspendedUntil.toLocaleString()}.`,
      });
    } else if (action === "ban") {
      targetUser.moderationStatus = "banned";
      targetUser.moderationNote = note;
      targetUser.bannedAt = new Date();
      targetUser.suspendedUntil = null;
      auditActionType = "admin_user_banned";

      await Notification.create({
        user: targetUser._id,
        type: "report_update",
        message: "Your account has been banned by an admin.",
      });
    } else {
      targetUser.moderationStatus = "active";
      targetUser.moderationNote = note;
      targetUser.suspendedUntil = null;
      targetUser.warnedAt = null;
      targetUser.bannedAt = null;
      auditActionType = "admin_user_reactivated";

      await Notification.create({
        user: targetUser._id,
        type: "report_update",
        message: "Your account has been restored to active status.",
      });
    }

    await targetUser.save();

    await AuditLog.create({
      actor: admin._id,
      actorRole: admin.role,
      actionType: auditActionType,
      targetUser: targetUser._id,
      note:
        note ||
        `Admin performed ${action} action on user ${targetUser.username}.`,
    });

    return ok({
      message: "User moderation action applied successfully",
      user: {
        _id: targetUser._id,
        username: targetUser.username,
        moderationStatus: targetUser.moderationStatus,
        moderationNote: targetUser.moderationNote,
        suspendedUntil: targetUser.suspendedUntil,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/users/[id] error:", error);
    return fail("Failed to update user moderation status", 500);
  }
}
