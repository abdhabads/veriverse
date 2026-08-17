import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import Post from "@/models/Post";
import Report from "@/models/Report";
import Appeal from "@/models/Appeal";
import { ok, fail } from "@/lib/apiResponse";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return fail("Admin access required", 403);
    }

    const { searchParams } = new URL(req.url);
    const queue = (searchParams.get("queue") || "all").trim();

    const [
      flaggedPosts,
      expertReviewPosts,
      reportQueue,
      appealQueue,
    ] = await Promise.all([
      queue === "all" || queue === "flagged"
        ? Post.find({ status: "flagged" })
            .populate("author", "username reputation avatarUrl")
            .sort({ createdAt: -1 })
            .limit(50)
        : [],
      queue === "all" || queue === "expert"
        ? Post.find({ status: "under_expert_review" })
            .populate("author", "username reputation avatarUrl")
            .sort({ createdAt: -1 })
            .limit(50)
        : [],
      queue === "all" || queue === "reports"
        ? Report.find({ status: "pending" })
            .populate("reporter", "username reputation")
            .populate({
              path: "post",
              populate: {
                path: "author",
                model: "User",
                select: "username reputation avatarUrl",
              },
            })
            .sort({ createdAt: -1 })
            .limit(50)
        : [],
      queue === "all" || queue === "appeals"
        ? Appeal.find({ status: { $in: ["pending", "under_review"] } })
            .populate("appellant", "username reputation avatarUrl")
            .populate({
              path: "post",
              populate: {
                path: "author",
                model: "User",
                select: "username reputation avatarUrl",
              },
            })
            .sort({ createdAt: -1 })
            .limit(50)
        : [],
    ]);

    return ok({
      queue,
      queues: {
        flaggedPosts,
        expertReviewPosts,
        reportQueue,
        appealQueue,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/queues error:", error);
    return fail("Failed to fetch moderation queues", 500);
  }
}
