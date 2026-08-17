import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Post from "@/models/Post";
import Report from "@/models/Report";
import Comment from "@/models/Comment";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const [
      totalUsers,
      totalPosts,
      totalComments,
      totalReports,
      flaggedPosts,
      finalizedPosts,
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Comment.countDocuments(),
      Report.countDocuments(),
      Post.countDocuments({ status: "flagged" }),
      Post.countDocuments({ finalized: true }),
    ]);

    return NextResponse.json({
      success: true,
      metrics: {
        totalUsers,
        totalPosts,
        totalComments,
        totalReports,
        flaggedPosts,
        finalizedPosts,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}