import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";

type RouteContext = {
  params: Promise<{ tag: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { tag } = await context.params;

    const posts = await Post.find({
      hashtags: tag.toLowerCase(),
    })
      .populate("author", "username reputation avatarUrl badges")
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      tag: tag.toLowerCase(),
      posts,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch topic" },
      { status: 500 }
    );
  }
}
