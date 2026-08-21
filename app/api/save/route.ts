import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SavedPost from "@/models/SavedPost";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";

export async function POST(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "save", String(user._id)),
      windowMs: 60 * 1000,
      max: 40,
      message: "Too many save actions. Please slow down.",
    });

    if (limitResponse) return limitResponse;

    const { postId } = await req.json();

    const existing = await SavedPost.findOne({
      user: user._id,
      post: postId,
    });

    if (existing) {
      await SavedPost.deleteOne({ _id: existing._id });

      return NextResponse.json({
        success: true,
        saved: false,
      });
    }

    await SavedPost.create({
      user: user._id,
      post: postId,
    });

    return NextResponse.json({
      success: true,
      saved: true,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to save post" }, { status: 500 });
  }
}
