import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import User from "@/models/User";
import Post from "@/models/Post";
import Comment from "@/models/Comment";
import Report from "@/models/Report";
import Appeal from "@/models/Appeal";
import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";
import { ok, fail } from "@/lib/apiResponse";

function getPastDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function countByDay(model: any, startDate: Date) {
  return model.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

async function sumPointsByDay(model: any, startDate: Date) {
  return model.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
          },
        },
        points: { $sum: { $ifNull: ["$pointsChange", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

export async function GET(req: Request) {
  await connectDB();

  try {
    const admin = await getUserFromRequest(req);

    if (!admin || admin.role !== "admin") {
      return fail("Admin access required", 403);
    }

    const today = new Date();
    const sevenDaysAgo = getPastDate(6);
    const thirtyDaysAgo = getPastDate(29);

    const [
      totalUsers,
      totalPosts,
      totalComments,
      totalReports,
      totalAppeals,
      totalRewardLogs,
      totalReputationLogs,
      usersLast7Days,
      postsLast7Days,
      commentsLast7Days,
      reportsLast7Days,
      appealsLast7Days,
      rewardsLast7Days,
      reputationLast7Days,
      usersLast30Days,
      postsLast30Days,
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Comment.countDocuments(),
      Report.countDocuments(),
      Appeal.countDocuments(),
      RewardLog.countDocuments(),
      ReputationLog.countDocuments(),

      countByDay(User, sevenDaysAgo),
      countByDay(Post, sevenDaysAgo),
      countByDay(Comment, sevenDaysAgo),
      countByDay(Report, sevenDaysAgo),
      countByDay(Appeal, sevenDaysAgo),
      sumPointsByDay(RewardLog, sevenDaysAgo),
      sumPointsByDay(ReputationLog, sevenDaysAgo),

      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Post.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    const last7Keys = Array.from({ length: 7 }).map((_, index) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - index));
      return formatDateKey(d);
    });

    const mapCountSeries = (items: Array<{ _id: string; count: number }>) => {
      const map: Record<string, number> = {};

      for (const key of last7Keys) {
        map[key] = 0;
      }

      for (const item of items) {
        const key = item._id;
        if (map[key] !== undefined) {
          map[key] += Number(item.count || 0);
        }
      }

      return last7Keys.map((key) => ({
        date: key,
        count: map[key] || 0,
      }));
    };

    const mapPointSeries = (items: Array<{ _id: string; points: number }>) => {
      const map: Record<string, number> = {};

      for (const key of last7Keys) {
        map[key] = 0;
      }

      for (const item of items) {
        const key = item._id;
        if (map[key] !== undefined) {
          map[key] += Number(item.points || 0);
        }
      }

      return last7Keys.map((key) => ({
        date: key,
        points: map[key] || 0,
      }));
    };

    const analytics = {
      totals: {
        totalUsers,
        totalPosts,
        totalComments,
        totalReports,
        totalAppeals,
        totalRewardLogs,
        totalReputationLogs,
      },
      last7Days: {
        users: mapCountSeries(usersLast7Days),
        posts: mapCountSeries(postsLast7Days),
        comments: mapCountSeries(commentsLast7Days),
        reports: mapCountSeries(reportsLast7Days),
        appeals: mapCountSeries(appealsLast7Days),
        rewards: mapPointSeries(rewardsLast7Days),
        reputation: mapPointSeries(reputationLast7Days),
      },
      snapshots: {
        usersLast7Days: usersLast7Days.reduce(
          (sum: number, item: { _id: string; count: number }) => sum + Number(item.count || 0),
          0
        ),
        postsLast7Days: postsLast7Days.reduce(
          (sum: number, item: { _id: string; count: number }) => sum + Number(item.count || 0),
          0
        ),
        commentsLast7Days: commentsLast7Days.reduce(
          (sum: number, item: { _id: string; count: number }) => sum + Number(item.count || 0),
          0
        ),
        reportsLast7Days: reportsLast7Days.reduce(
          (sum: number, item: { _id: string; count: number }) => sum + Number(item.count || 0),
          0
        ),
        appealsLast7Days: appealsLast7Days.reduce(
          (sum: number, item: { _id: string; count: number }) => sum + Number(item.count || 0),
          0
        ),
        usersLast30Days,
        postsLast30Days,
      },
    };

    return ok({ analytics });
  } catch (error) {
    console.error("GET /api/admin/analytics error:", error);
    return fail("Failed to fetch analytics", 500);
  }
}
