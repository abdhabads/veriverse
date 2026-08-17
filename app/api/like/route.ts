import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Like from "@/models/Like";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

export async function POST(req: Request) {
  await connectDB();

  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ success: false }, { status: 401 });

  const limitResponse = enforceRateLimit({
    key: getRateLimitKey(req, "like", String(user._id)),
    windowMs: 60 * 1000,
    max: 50,
    message: "Too many like actions. Please slow down.",
  });

  if (limitResponse) return limitResponse;

  const { postId } = await req.json();

  const existing = await Like.findOne({ user: user._id, post: postId });

  if (existing) {
    await Like.deleteOne({ _id: existing._id });
    await Post.findByIdAndUpdate(postId, { $inc: { likesCount: -1 } });

    return NextResponse.json({ success: true, liked: false });
  }

  await Like.create({ user: user._id, post: postId });
  await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });

  return NextResponse.json({ success: true, liked: true });
}
