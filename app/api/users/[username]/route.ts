import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Post from "@/models/Post";

type RouteContext = {
  params: Promise<{ username: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { username } = await context.params;

    const user = await User.findOne({ username }).select("-password");
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .populate("author", "username reputation badges");

    return NextResponse.json({
      success: true,
      user,
      posts,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch user profile" },
      { status: 500 }
    );
  }
}