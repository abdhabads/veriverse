import { connectDB } from "@/lib/mongodb";
import Report from "@/models/Report";
import Post from "@/models/Post";
import { requireActiveUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanOptionalString, cleanString, isValidObjectId } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";

const allowedReasons = ["misinformation", "spam", "abuse", "other"];

export async function POST(req: Request) {
  try {
    await connectDB();
    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

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

    if (String(post.author) === String(user._id)) {
      return fail("You cannot report your own post", 400);
    }

    const existing = await Report.findOne({
      reporter: user._id,
      post: postId,
    });

    if (existing) {
      return fail("You already reported this post", 409);
    }

    let report;
    try {
      report = await Report.create({
        reporter: user._id,
        post: postId,
        reason,
        note,
      });
    } catch (createError: any) {
      if (createError?.code === 11000) {
        return fail("You already reported this post", 409);
      }
      throw createError;
    }

    return ok({
      message: "Report submitted successfully",
      report,
    }, 201);
  } catch (error) {
    console.error("POST /api/reports error:", error);
    return fail("Failed to submit report", 500);
  }
}
