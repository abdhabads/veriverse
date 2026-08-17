import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import Comment from "@/models/Comment";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  await connectDB();

  try {
    const { id } = await context.params;

    const post = await Post.findById(id).populate("author", "username reputation");
    if (!post) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    const comments = await Comment.find({ post: id })
      .populate("author", "username reputation")
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      post,
      comments,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch post detail" },
      { status: 500 }
    );
  }
}