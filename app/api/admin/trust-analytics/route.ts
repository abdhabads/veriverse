import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import Post from "@/models/Post";
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


    const today = new Date();
    const sevenDaysAgo = getPastDate(6);
    const last7Keys = Array.from({ length: 7 }).map((_, index) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - index));
      return formatDateKey(d);
    });

    await connectDB();


    try {
      const admin = await getUserFromRequest(req);

      if (!admin || admin.role !== "admin") {
        return fail("Admin access required", 403);
      }

      // Fetch analytics variables after all dependencies are declared
      const [
        totalPosts,
        verifiedPosts,
        falsePosts,
        disputedPosts,
        flaggedPosts,
        expertReviewPosts,
        appealReviewPosts,
        activeAppeals,
        approvedAppeals,
        rejectedAppeals,
        highRiskPosts,
        groundedCheckedPosts,
        insufficientEvidencePosts,
        contradictedEvidencePosts,
        recentPosts,
        recentRewardLogs,
        recentReputationLogs,
      ] = await Promise.all([
        Post.countDocuments(),
        Post.countDocuments({ status: "verified" }),
        Post.countDocuments({ status: "false" }),
        Post.countDocuments({ status: "disputed" }),
        Post.countDocuments({ status: "flagged" }),
        Post.countDocuments({ status: "under_expert_review" }),
        Post.countDocuments({ status: "under_appeal_review" }),
        Appeal.countDocuments({ status: { $in: ["pending", "under_review"] } }),
        Appeal.countDocuments({ status: "approved" }),
        Appeal.countDocuments({ status: "rejected" }),
        Post.countDocuments({ aiRiskScore: { $gte: 35 } }),
        Post.countDocuments({ groundingStatus: "checked" }),
        Post.countDocuments({ groundingStatus: "insufficient_evidence" }),
        Post.countDocuments({ contradictionCount: { $gte: 1 } }),
        Post.find({ createdAt: { $gte: sevenDaysAgo } }).select(
          "createdAt status aiRiskScore groundingStatus groundingConfidence contradictionCount supportCount"
        ),
        sumPointsByDay(RewardLog, sevenDaysAgo),
        sumPointsByDay(ReputationLog, sevenDaysAgo),
      ]);


    // (Removed duplicate destructuring block for analytics counts)

    const outcomeByDayMap: Record<
      string,
      {
        verified: number;
        false: number;
        disputed: number;
      }
    > = {};

    for (const key of last7Keys) {
      outcomeByDayMap[key] = {
        verified: 0,
        false: 0,
        disputed: 0,
      };
    }

    for (const post of recentPosts as Array<{
      createdAt: Date;
      status: string;
    }>) {
      const key = formatDateKey(new Date(post.createdAt));
      if (!outcomeByDayMap[key]) continue;

      if (post.status === "verified") {
        outcomeByDayMap[key].verified += 1;
      }

      if (post.status === "false") {
        outcomeByDayMap[key].false += 1;
      }

      if (post.status === "disputed") {
        outcomeByDayMap[key].disputed += 1;
      }
    }

    const outcomeTrend = last7Keys.map((key) => ({
      date: key,
      verified: outcomeByDayMap[key].verified,
      false: outcomeByDayMap[key].false,
      disputed: outcomeByDayMap[key].disputed,
    }));

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

    const safeTotalPosts = Math.max(totalPosts, 1);

    const trustAnalytics = {
      summary: {
        totalPosts,
        verifiedPosts,
        falsePosts,
        disputedPosts,
        flaggedPosts,
        expertReviewPosts,
        appealReviewPosts,
        activeAppeals,
        approvedAppeals,
        rejectedAppeals,
        highRiskPosts,
        groundedCheckedPosts,
        insufficientEvidencePosts,
        contradictedEvidencePosts,
      },
      ratios: {
        verifiedRate: Number(((verifiedPosts / safeTotalPosts) * 100).toFixed(1)),
        falseRate: Number(((falsePosts / safeTotalPosts) * 100).toFixed(1)),
        disputedRate: Number(((disputedPosts / safeTotalPosts) * 100).toFixed(1)),
        flaggedRate: Number(((flaggedPosts / safeTotalPosts) * 100).toFixed(1)),
        highRiskRate: Number(((highRiskPosts / safeTotalPosts) * 100).toFixed(1)),
        groundedCoverageRate: Number(((groundedCheckedPosts / safeTotalPosts) * 100).toFixed(1)),
        insufficientEvidenceRate: Number(((insufficientEvidencePosts / safeTotalPosts) * 100).toFixed(1)),
        contradictedEvidenceRate: Number(((contradictedEvidencePosts / safeTotalPosts) * 100).toFixed(1)),
      },
      trends: {
        outcomeTrend,
        rewardFlow: mapPointSeries(recentRewardLogs as Array<{ _id: string; points: number }>),
        reputationFlow: mapPointSeries(recentReputationLogs as Array<{ _id: string; points: number }>),
      },
    };

    return ok({ trustAnalytics });
  } catch (error) {
    console.error("GET /api/admin/trust-analytics error:", error);
    return fail("Failed to fetch trust analytics", 500);
  }
}
