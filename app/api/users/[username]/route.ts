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

    // Public-facing allowlist only - this route is unauthenticated, so any
    // field returned here is visible to anyone. Never widen this with a
    // denylist (e.g. "-password"): new User fields must be explicitly
    // reviewed before they become publicly exposed.
    const user = await User.findOne({ username }).select(
      "username bio avatarUrl reputation rewardPoints badges"
    );
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