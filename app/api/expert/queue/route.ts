import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();

  try {
    const hoursSince = (value?: string | Date) => {
      const createdAt = new Date(value || Date.now());
      return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
    };

    const user = await getUserFromRequest(req);

    if (!user || !["expert", "admin"].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Expert or admin access required" },
        { status: 403 }
      );
    }

    const posts = await Post.find({
      needsExpertReview: true,
      expertReviewedBy: null,
      finalized: { $ne: true },
      trustEvaluationState: { $ne: "finalized" },
    })
      .populate("author", "username reputation avatarUrl badges")
      .sort({ createdAt: -1 });

    const now = new Date();
    const queueItems = posts.map((post: any) => {
      const createdAt = new Date(post.createdAt || now);
      const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const ageLabel = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : `${ageHours}h`;
      const isStale = ageHours > 48;

      return {
        ...post.toObject(),
        ageHours,
        ageDays,
        ageLabel,
        isStale,
      };
    });

    const ages = posts.map((post: any) => hoursSince(post.createdAt));
    const queueMetrics = {
      totalInQueue: posts.length,
      staleCount: ages.filter((age) => age > 48).length,
      avgAgeHours:
        posts.length > 0
          ? Math.floor(ages.reduce((sum, age) => sum + age, 0) / posts.length)
          : 0,
      oldestAgeHours: posts.length > 0 ? Math.max(...ages) : 0,
    };

    return NextResponse.json({
      success: true,
      posts: queueItems,
      queueMetrics,
    });
  } catch (error) {
    console.error("GET /api/expert/queue error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch expert queue" },
      { status: 500 }
    );
  }
}
