import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ReputationLog from "@/models/ReputationLog";
import User from "@/models/User";
// Registers the "Post" model for Mongoose so .populate("referencePost", ...)
// below can resolve it - this route never queries Post directly, but the
// import's registration side effect is required.
import Post from "@/models/Post";
import { getUserFromRequest } from "@/lib/auth";

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

    const logs = await ReputationLog.find({ user: user._id })
      .populate("referencePost", "content status")
      .sort({ createdAt: -1 })
      .limit(100);

    const freshUser = await User.findById(user._id).select(
      "username reputation rewardPoints badges role expertCategory"
    );

    return NextResponse.json({
      success: true,
      user: freshUser,
      logs,
      totalReputation: freshUser?.reputation || 0,
    });
  } catch (error) {
    console.error("GET /api/reputation error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch reputation history" },
      { status: 500 }
    );
  }
}
