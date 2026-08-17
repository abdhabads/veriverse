import { connectDB } from "@/lib/mongodb";
import Report from "@/models/Report";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanOptionalString, cleanString, isValidObjectId } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";

const allowedReasons = ["misinformation", "spam", "abuse", "other"];

export async function POST(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);
    if (!user) return fail("Unauthorized", 401);

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "report", String(user._id)),
      windowMs: 60 * 1000,
      max: 10,
      message: "Too many reports submitted. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();
    const postId = typeof body.postId === "string" ? body.postId : "";
    const reason = cleanString(body.reason, { maxLength: 40 });
    const note = cleanOptionalString(body.note, { maxLength: 500 });

    if (!isValidObjectId(postId)) {
      return fail("Invalid post ID", 400);
    }

    if (!reason || !allowedReasons.includes(reason)) {
      return fail("Invalid report reason", 400);
    }

    const post = await Post.findById(postId);
    if (!post) return fail("Post not found", 404);

    const existing = await Report.findOne({
      reporter: user._id,
      post: postId,
    });

    if (existing) {
      return fail("You already reported this post", 409);
    }

    const report = await Report.create({
      reporter: user._id,
      post: postId,
      reason,
      note,
    });

    return ok({
      message: "Report submitted successfully",
      report,
    }, 201);
  } catch (error) {
    console.error("POST /api/reports error:", error);
    return fail("Failed to submit report", 500);
  }
}
