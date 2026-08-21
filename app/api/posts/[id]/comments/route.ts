import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Comment from "@/models/Comment";
import Post from "@/models/Post";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { getUserIdFromRequest } from "@/lib/auth";
import { extractMentions } from "@/lib/mentions";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id: postId } = await context.params;

    const comments = await Comment.find({ post: postId })
      .populate("author", "username reputation avatarUrl badges")
      .sort({ createdAt: 1 });

    return NextResponse.json({
      success: true,
      comments,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const userId = getUserIdFromRequest(req);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "comment", userId),
      windowMs: 60 * 1000,
      max: 15,
      message: "You are commenting too quickly. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const { id: postId } = await context.params;
    const { content, parentComment } = await req.json();

    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, message: "Comment content is required" },
        { status: 400 }
      );
    }

    const post = await Post.findById(postId);
    if (!post) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (parentComment) {
      const parent = await Comment.findById(parentComment);
      if (!parent || String(parent.post) !== String(postId)) {
        return NextResponse.json(
          { success: false, message: "Invalid parent comment" },
          { status: 400 }
        );
      }
    }

    const mentions = extractMentions(content.trim());

    const comment = await Comment.create({
      post: postId,
      author: userId,
      content: content.trim(),
      parentComment: parentComment || null,
      mentions,
    });

    if (String(post.author) !== String(userId)) {
      await Notification.create({
        user: post.author,
        type: "comment_received",
        message: `${user.username} commented on your post.`,
        referencePost: post._id,
      });
    }

    if (parentComment) {
      const parent = await Comment.findById(parentComment).populate("author", "username");
      if (
        parent &&
        parent.author &&
        String((parent.author as any)._id || parent.author) !== String(userId)
      ) {
        await Notification.create({
          user: (parent.author as any)._id || parent.author,
          type: "comment_received",
          message: `${user.username} replied to your comment.`,
          referencePost: post._id,
        });
      }
    }

    const mentionedUsers = await User.find({
      username: { $in: mentions },
    });

    for (const mentionedUser of mentionedUsers) {
      if (String(mentionedUser._id) !== String(userId)) {
        await Notification.create({
          user: mentionedUser._id,
          type: "comment_received",
          message: `${user.username} mentioned you in a comment.`,
          referencePost: post._id,
        });
      }
    }

    const populatedComment = await Comment.findById(comment._id).populate(
      "author",
      "username reputation avatarUrl badges"
    );

    return NextResponse.json({
      success: true,
      message: "Comment added successfully",
      comment: populatedComment,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to add comment" },
      { status: 500 }
    );
  }
}
