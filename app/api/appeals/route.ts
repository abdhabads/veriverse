import { connectDB } from "@/lib/mongodb";
import Appeal from "@/models/Appeal";
import Post from "@/models/Post";
import Notification from "@/models/Notification";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanString, isValidObjectId } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";

export async function POST(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);
    if (!user) return fail("Unauthorized", 401);

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "appeal", String(user._id)),
      windowMs: 60 * 1000,
      max: 5,
      message: "Too many appeals submitted. Please wait before trying again.",
    });

    if (limitResponse) return limitResponse;

    const body = await req.json();
    const postId = typeof body.postId === "string" ? body.postId : "";
    const reason = cleanString(body.reason, { maxLength: 1000 });

    if (!isValidObjectId(postId)) {
      return fail("Invalid post ID", 400);
    }

    if (!reason) {
      return fail("Appeal reason is required.", 400);
    }

    const post = await Post.findById(postId);
    if (!post) return fail("Post not found", 404);

    const appealableStatuses = ["false", "flagged", "disputed"];
    if (!appealableStatuses.includes(post.status)) {
      return fail("This post cannot be appealed right now", 400);
    }

    const existingAppeal = await Appeal.findOne({
      post: postId,
      appellant: user._id,
      status: { $in: ["pending", "under_review"] },
    });

    if (existingAppeal) {
      return fail("You already have an active appeal for this post", 409);
    }

    const appeal = await Appeal.create({
      post: postId,
      appellant: user._id,
      reason,
    });

    post.hasActiveAppeal = true;
    post.appealCount = (post.appealCount || 0) + 1;
    post.status = "under_appeal_review";
    await post.save();

    if (String(post.author) !== String(user._id)) {
      await Notification.create({
        user: post.author,
        type: "report_update",
        message: "A post you are connected to has entered appeal review.",
        referencePost: post._id,
      });
    }

    return ok({
      message: "Appeal submitted successfully",
      appeal,
    }, 201);
  } catch (error) {
    console.error("POST /api/appeals error:", error);
    return fail("Failed to submit appeal", 500);
  }
}
