import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Repost from "@/models/Repost";
import Post from "@/models/Post";
import Notification from "@/models/Notification";
import { requireActiveUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { hasBidirectionalBlock } from "@/lib/messaging";

export async function POST(req: Request) {
  try {
    await connectDB();

    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "repost", String(user._id)),
      windowMs: 60 * 1000,
      max: 20,
      message: "Too many repost actions. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const { postId } = await req.json();

    const existing = await Repost.findOne({ user: user._id, post: postId });

    if (existing) {
      await Repost.deleteOne({ _id: existing._id });
      await Post.findByIdAndUpdate(postId, { $inc: { repostsCount: -1 } });

      return NextResponse.json({ success: true, reposted: false });
    }

    // Block is a reciprocal interaction boundary: reject a *new* repost of a
    // blocked party's content before creating anything. Removing an existing
    // repost (the branch above) is always allowed, even across a block, so
    // this never traps stale state.
    const targetPost = await Post.findById(postId).select("author");
    if (targetPost && (await hasBidirectionalBlock(String(user._id), String(targetPost.author)))) {
      return NextResponse.json(
        { success: false, message: "You cannot repost this post" },
        { status: 403 }
      );
    }

    await Repost.create({ user: user._id, post: postId });
    const post = await Post.findByIdAndUpdate(postId, { $inc: { repostsCount: 1 } });

    if (post && String(post.author) !== String(user._id)) {
      try {
        await Notification.create({
          user: post.author,
          type: "repost_received",
          message: `${user.username} reposted your post.`,
          referencePost: post._id,
        });
      } catch (notifyError) {
        // The repost itself already succeeded - a failed notification must
        // not turn a successful repost into an apparent failure.
        console.error("Failed to create repost notification:", notifyError);
      }
    }

    return NextResponse.json({ success: true, reposted: true });
  } catch (error) {
    console.error("POST /api/repost error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
