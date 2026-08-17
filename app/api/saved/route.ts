import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SavedPost from "@/models/SavedPost";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const saved = await SavedPost.find({ user: user._id })
      .populate({
        path: "post",
        populate: {
          path: "author",
          select: "username reputation",
        },
      })
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      saved,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to fetch saved posts" }, { status: 500 });
  }
}
