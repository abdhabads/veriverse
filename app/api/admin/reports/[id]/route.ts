import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Report from "@/models/Report";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";
import AuditLog from "@/models/AuditLog";
import { canTransitionTrustState } from "@/lib/trustTransitions";
import { setPostTrustStatus } from "@/lib/setPostTrustStatus";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const { action } = await req.json();

    const report = await Report.findById(id);
    if (!report) {
      return NextResponse.json(
        { success: false, message: "Report not found" },
        { status: 404 }
      );
    }

    if (action === "dismiss") {
      report.status = "dismissed";
      await report.save();

      await AuditLog.create({
        actor: user._id,
        actorRole: user.role,
        actionType: "report_dismiss",
        targetReport: report._id,
        targetPost: report.post,
        note: "Admin dismissed a user report.",
      });

      return NextResponse.json({
        success: true,
        message: "Report dismissed",
      });
    }

    if (action === "flag_post") {
      const post = await Post.findById(report.post);
      if (!post) {
        return NextResponse.json(
          { success: false, message: "Related post not found" },
          { status: 404 }
        );
      }
      if (canTransitionTrustState(post.status, "flagged")) {
        setPostTrustStatus(post, "flagged");
        await post.save();
      }
      report.status = "reviewed";
      await report.save();

      await AuditLog.create({
        actor: user._id,
        actorRole: user.role,
        actionType: "report_flag_post",
        targetReport: report._id,
        targetPost: report.post,
        note: "Admin reviewed a report and flagged the related post.",
      });

      return NextResponse.json({
        success: true,
        message: "Post flagged successfully",
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to review report" },
      { status: 500 }
    );
  }
}
