import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Appeal from "@/models/Appeal";
import Post from "@/models/Post";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";
import AuditLog from "@/models/AuditLog";
import { setPostTrustStatus } from "@/lib/setPostTrustStatus";
import { recordTrustEvent } from "@/lib/trustEvents";
import { reconcilePriorTrustEffects } from "@/lib/trustReconciliation";
import { ensureTrustSettlementOnce } from "@/lib/trustSettlementGuard";
import NotificationModel from "@/models/Notification";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const admin = await getUserFromRequest(req);

    if (!admin || admin.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim().length > 0) body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const { decision, resolutionNote } = body as {
      decision?: string;
      resolutionNote?: string;
    };

    if (!["under_review", "approved", "rejected"].includes(decision ?? "")) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid decision. Must be under_review, approved, or rejected.",
        },
        { status: 400 }
      );
    }

    const appeal = await Appeal.findById(id);
    if (!appeal) {
      return NextResponse.json(
        { success: false, message: "Appeal not found" },
        { status: 404 }
      );
    }

    // Block re-resolution of already finalized appeals
    if (["approved", "rejected"].includes(appeal.status)) {
      return NextResponse.json(
        { success: false, message: "Appeal already resolved" },
        { status: 409 }
      );
    }

    // Block redundant under_review transitions
    if (decision === "under_review" && appeal.status === "under_review") {
      return NextResponse.json(
        { success: false, message: "Appeal is already under review" },
        { status: 409 }
      );
    }

    const post = await Post.findById(appeal.post);
    if (!post) {
      return NextResponse.json(
        { success: false, message: "Related post not found" },
        { status: 404 }
      );
    }

    // --- under_review: signal to user that admin has picked up the appeal ---
    if (decision === "under_review") {
      appeal.status = "under_review";
      appeal.reviewedBy = admin._id;
      await appeal.save();

      await NotificationModel.create({
        user: appeal.appellant,
        type: "report_update",
        message: "Your appeal is now under active review by an admin.",
        referencePost: post._id,
      });

      await AuditLog.create({
        actor: admin._id,
        actorRole: admin.role,
        actionType: "appeal_under_review",
        targetAppeal: appeal._id,
        targetPost: post._id,
        targetUser: appeal.appellant,
        note: resolutionNote?.trim() || "Admin marked appeal as under review.",
      });

      return NextResponse.json({
        success: true,
        message: "Appeal marked as under review",
        appeal: {
          _id: appeal._id,
          status: appeal.status,
        },
      });
    }

    // --- approved ---
    if (decision === "approved") {
      appeal.status = "approved";
      appeal.reviewedBy = admin._id;
      appeal.resolutionNote = resolutionNote?.trim() || "";
      await appeal.save();

      post.hasActiveAppeal = false;

      // If post has no expert decision, send back to unverified for fresh evaluation
      // If post had an expert decision, move to disputed so experts can re-review
      const targetStatus = post.expertDecision ? "disputed" : "unverified";

      // Post may be in under_appeal_review - transition through it cleanly
      if (post.status !== "under_appeal_review") {
        setPostTrustStatus(post, "under_appeal_review");
      }
      setPostTrustStatus(post, targetStatus);

      post.finalized = false;
      post.finalizedAt = null;
      post.trustEvaluationState = "reopened";
      post.lastTrustEvaluatedAt = new Date();
      await post.save();

      await recordTrustEvent({
        postId: String(post._id),
        trustDecisionVersion: Number(post.trustDecisionVersion || 1),
        eventType: "appeal_approved_reopen",
        metadata: {
          appealId: String(appeal._id),
          adminId: String(admin._id),
          targetStatus,
        },
      });

      const settlementCheck = await ensureTrustSettlementOnce({
        postId: String(post._id),
        trustDecisionVersion: Number(post.trustDecisionVersion || 1),
        eventType: "appeal_approved_reopen",
        metadata: {
          appealId: String(appeal._id),
          adminId: String(admin._id),
        },
      });

      if (settlementCheck.shouldApply) {
        const author = await User.findById(post.author);
        if (author) {
          await reconcilePriorTrustEffects({
            post,
            author,
            reason: "Appeal approved. Prior trust effects were reconciled.",
            trustEventKey: settlementCheck.eventKey,
          });
          await NotificationModel.create({
            user: post.author,
            type: "report_update",
            message: "Your appeal was approved and prior trust effects were reconciled.",
            referencePost: post._id,
          });
        }
      }

      await NotificationModel.create({
        user: appeal.appellant,
        type: "report_update",
        message: `Your appeal was approved. The post has been moved to ${targetStatus} for re-evaluation.`,
        referencePost: post._id,
      });

      await NotificationModel.create({
        user: post.author,
        type: "report_update",
        message: `An appeal on your post was approved. The post is now ${targetStatus}.`,
        referencePost: post._id,
      });

      await AuditLog.create({
        actor: admin._id,
        actorRole: admin.role,
        actionType: "appeal_approved",
        targetAppeal: appeal._id,
        targetPost: post._id,
        targetUser: appeal.appellant,
        note: resolutionNote?.trim() || "Appeal approved. Trust effects reconciled.",
      });

      return NextResponse.json({
        success: true,
        message: "Appeal approved successfully",
        appeal: { _id: appeal._id, status: appeal.status },
        post: {
          id: post._id,
          status: post.status,
          hasActiveAppeal: post.hasActiveAppeal,
        },
      });
    }

    // --- rejected ---
    appeal.status = "rejected";
    appeal.reviewedBy = admin._id;
    appeal.resolutionNote = resolutionNote?.trim() || "";
    await appeal.save();

    post.hasActiveAppeal = false;

    // Restore post to its pre-appeal state
    if (post.expertDecision && post.status === "under_appeal_review") {
      setPostTrustStatus(post, post.expertDecision as "verified" | "false" | "disputed");
      post.trustEvaluationState = "finalized";
      post.lastTrustEvaluatedAt = new Date();
    }

    await post.save();

    await recordTrustEvent({
      postId: String(post._id),
      trustDecisionVersion: Number(post.trustDecisionVersion || 1),
      eventType: "appeal_rejected",
      metadata: {
        appealId: String(appeal._id),
        adminId: String(admin._id),
      },
    });

    await NotificationModel.create({
      user: appeal.appellant,
      type: "report_update",
      message: `Your appeal was reviewed and rejected. ${resolutionNote?.trim() ? `Admin note: ${resolutionNote.trim()}` : ""}`.trim(),
      referencePost: post._id,
    });

    await AuditLog.create({
      actor: admin._id,
      actorRole: admin.role,
      actionType: "appeal_rejected",
      targetAppeal: appeal._id,
      targetPost: post._id,
      targetUser: appeal.appellant,
      note: resolutionNote?.trim() || "Appeal rejected.",
    });

    return NextResponse.json({
      success: true,
      message: "Appeal rejected",
      appeal: { _id: appeal._id, status: appeal.status },
      post: {
        id: post._id,
        status: post.status,
        hasActiveAppeal: post.hasActiveAppeal,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/appeals/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to resolve appeal" },
      { status: 500 }
    );
  }
}
