import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import User from "@/models/User";
import Post from "@/models/Post";
import Report from "@/models/Report";
import Appeal from "@/models/Appeal";
import AuditLog from "@/models/AuditLog";
import { ok, fail } from "@/lib/apiResponse";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return fail("Admin access required", 403);
    }

    const [
      totalUsers,
      totalPosts,
      totalReports,
      totalAppeals,
      pendingReports,
      pendingAppeals,
      flaggedPosts,
      expertReviewPosts,
      appealReviewPosts,
      finalizedPosts,
      highRiskPosts,
      recentAppeals,
      recentAuditLogs,
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Report.countDocuments(),
      Appeal.countDocuments(),
      Report.countDocuments({ status: "pending" }),
      Appeal.countDocuments({ status: { $in: ["pending", "under_review"] } }),
      Post.countDocuments({ status: "flagged" }),
      Post.countDocuments({ status: "under_expert_review" }),
      Post.countDocuments({ status: "under_appeal_review" }),
      Post.countDocuments({ finalized: true }),
      Post.find({ aiRiskScore: { $gte: 35 } })
        .populate("author", "username reputation avatarUrl")
        .sort({ createdAt: -1 })
        .limit(8),
      Appeal.find()
        .populate("appellant", "username reputation")
        .populate("post", "content status")
        .sort({ createdAt: -1 })
        .limit(6),
      AuditLog.find()
        .populate("actor", "username role")
        .sort({ createdAt: -1 })
        .limit(8),
    ]);

    return ok({
      metrics: {
        totalUsers,
        totalPosts,
        totalReports,
        totalAppeals,
        pendingReports,
        pendingAppeals,
        flaggedPosts,
        expertReviewPosts,
        appealReviewPosts,
        finalizedPosts,
      },
      highRiskPosts,
      recentAppeals,
      recentAuditLogs,
    });
  } catch (error) {
    console.error("GET /api/admin/overview error:", error);
    return fail("Failed to fetch admin overview", 500);
  }
}
