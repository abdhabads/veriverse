import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Comment from "@/models/Comment";
import Post from "@/models/Post";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { requireActiveUser } from "@/lib/auth";
import { extractMentions } from "@/lib/mentions";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { hasBidirectionalBlock } from "@/lib/messaging";

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
    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;
    const userId = String(user._id);

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

    let parentAuthorId: string | null = null;
    if (parentComment) {
      const parent = await Comment.findById(parentComment).populate("author", "username");
      if (!parent || String(parent.post) !== String(postId)) {
        return NextResponse.json(
          { success: false, message: "Invalid parent comment" },
          { status: 400 }
        );
      }
      parentAuthorId = parent.author
        ? String((parent.author as any)._id || parent.author)
        : null;
    }

    // Block is a reciprocal interaction boundary: reject the direct
    // interaction (commenting on this post, or replying to this specific
    // comment) before anything is created. Unrelated mentions elsewhere in
    // the comment are handled separately below (suppressed, not rejected).
    if (await hasBidirectionalBlock(userId, String(post.author))) {
      return NextResponse.json(
        { success: false, message: "You cannot comment on this post" },
        { status: 403 }
      );
    }

    if (parentAuthorId && (await hasBidirectionalBlock(userId, parentAuthorId))) {
      return NextResponse.json(
        { success: false, message: "You cannot reply to this comment" },
        { status: 403 }
      );
    }

    const mentions = extractMentions(content.trim());

    const comment = await Comment.create({
      post: postId,
      author: userId,
      content: content.trim(),
      parentComment: parentComment || null,
      mentions,
    });

    // Tracks recipients already notified for this comment/reply event so a
    // single person (e.g. post author who is also the parent-comment author
    // or a mentioned user) receives at most one comment_received notification.
    const notifiedRecipients = new Set<string>([String(userId)]);

    if (!notifiedRecipients.has(String(post.author))) {
      notifiedRecipients.add(String(post.author));
      await Notification.create({
        user: post.author,
        type: "comment_received",
        message: `${user.username} commented on your post.`,
        referencePost: post._id,
      });
    }

    if (parentAuthorId && !notifiedRecipients.has(parentAuthorId)) {
      notifiedRecipients.add(parentAuthorId);
      await Notification.create({
        user: parentAuthorId,
        type: "comment_received",
        message: `${user.username} replied to your comment.`,
        referencePost: post._id,
      });
    }

    const mentionedUsers = await User.find({
      username: { $in: mentions },
    });

    for (const mentionedUser of mentionedUsers) {
      const mentionedId = String(mentionedUser._id);
      if (notifiedRecipients.has(mentionedId)) continue;
      // A mention of an unrelated third party doesn't reject the comment
      // (only direct post-author/parent-author interaction does, above) -
      // it just never notifies a mentioned user the commenter is blocked
      // with, in either direction.
      if (await hasBidirectionalBlock(userId, mentionedId)) continue;

      notifiedRecipients.add(mentionedId);
      await Notification.create({
        user: mentionedUser._id,
        type: "comment_received",
        message: `${user.username} mentioned you in a comment.`,
        referencePost: post._id,
      });
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
