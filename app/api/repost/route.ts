import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Repost from "@/models/Repost";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

export async function POST(req: Request) {
  try {
    await connectDB();

    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

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

    await Repost.create({ user: user._id, post: postId });
    await Post.findByIdAndUpdate(postId, { $inc: { repostsCount: 1 } });

    return NextResponse.json({ success: true, reposted: true });
  } catch (error) {
    console.error("POST /api/repost error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
