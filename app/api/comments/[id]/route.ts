import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Comment from "@/models/Comment";
import { getUserFromRequest } from "@/lib/auth";
import { extractMentions } from "@/lib/mentions";
import { cleanString, isValidObjectId } from "@/lib/validation";
import { ok, fail } from "@/lib/apiResponse";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) return fail("Unauthorized", 401);

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "edit_comment", String(user._id)),
      windowMs: 60 * 1000,
      max: 20,
      message: "You are editing too quickly. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const { id } = await context.params;
    if (!isValidObjectId(id)) return fail("Invalid comment ID", 400);

    const body = await req.json();
    const content = cleanString(body.content, { maxLength: 300 });

    if (!content) {
      return fail("Comment content is required and must be under 300 characters.", 400);
    }

    const comment = await Comment.findById(id);
    if (!comment) return fail("Comment not found", 404);

    if (String(comment.author) !== String(user._id) && user.role !== "admin") {
      return fail("Forbidden", 403);
    }

    comment.content = content;
    comment.mentions = extractMentions(content);
    await comment.save();

    return ok({
      message: "Comment updated successfully",
      comment,
    });
  } catch (error) {
    console.error("PATCH /api/comments/[id] error:", error);
    return fail("Failed to update comment", 500);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) return fail("Unauthorized", 401);

    const { id } = await context.params;
    if (!isValidObjectId(id)) return fail("Invalid comment ID", 400);

    const comment = await Comment.findById(id);
    if (!comment) return fail("Comment not found", 404);

    if (String(comment.author) !== String(user._id) && user.role !== "admin") {
      return fail("Forbidden", 403);
    }

    comment.isDeleted = true;
    comment.content = "[deleted]";
    await comment.save();

    return ok({
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /api/comments/[id] error:", error);
    return fail("Failed to delete comment", 500);
  }
}
