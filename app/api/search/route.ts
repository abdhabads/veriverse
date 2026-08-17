import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Post from "@/models/Post";

export async function GET(req: Request) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const type = (searchParams.get("type") || "all").trim();

    if (!q) {
      return NextResponse.json({
        success: true,
        users: [],
        posts: [],
        hashtags: [],
      });
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    let users: any[] = [];
    let posts: any[] = [];
    let hashtags: string[] = [];

    if (type === "all" || type === "users") {
      users = await User.find({
        username: { $regex: regex },
      })
        .select("username reputation rewardPoints avatarUrl badges bio")
        .limit(20);
    }

    if (type === "all" || type === "posts") {
      posts = await Post.find({
        $or: [
          { content: { $regex: regex } },
          { hashtags: q.toLowerCase() },
        ],
      })
        .populate("author", "username reputation avatarUrl badges")
        .sort({ createdAt: -1 })
        .limit(30);
    }

    const hashtagMatches = await Post.aggregate([
      { $unwind: "$hashtags" },
      {
        $match: {
          hashtags: { $regex: regex },
        },
      },
      {
        $group: {
          _id: "$hashtags",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    hashtags = hashtagMatches.map((item) => item._id);

    return NextResponse.json({
      success: true,
      users,
      posts,
      hashtags,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to search" },
      { status: 500 }
    );
  }
}
