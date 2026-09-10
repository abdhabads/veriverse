import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Referral from "@/models/Referral";
import { getUserFromRequest } from "@/lib/auth";
import { getCommunityBuilderTier } from "@/lib/referrals";

export async function GET(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // joinedCount is every account ever successfully referred by this user,
    // regardless of current status - activated referrals remain counted
    // here too (10 joined, 6 of whom activated, not "10 joined vs 6 more
    // activated"). activatedCount is the activated subset of that same set.
    const [joinedCount, activatedCount] = await Promise.all([
      Referral.countDocuments({ referrer: user._id }),
      Referral.countDocuments({ referrer: user._id, status: "activated" }),
    ]);

    const res = NextResponse.json({
      success: true,
      referralCode: String(user._id),
      joinedCount,
      activatedCount,
      communityBuilderTier: getCommunityBuilderTier(activatedCount),
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("GET /api/referrals error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch referral stats" },
      { status: 500 }
    );
  }
}
