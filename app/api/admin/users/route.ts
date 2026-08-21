import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import User from "@/models/User";
import { ok, fail } from "@/lib/apiResponse";

export async function GET(req: Request) {
  try {
    await connectDB();
    const admin = await getUserFromRequest(req);

    if (!admin || admin.role !== "admin") {
      return fail("Admin access required", 403);
    }

    const users = await User.find()
      .select(
        "username email role reputation rewardPoints moderationStatus moderationNote suspendedUntil warnedAt bannedAt riskScore suspiciousFlags createdAt avatarUrl"
      )
      .sort({ createdAt: -1 })
      .limit(200);

    return ok({ users });
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return fail("Failed to fetch users", 500);
  }
}
