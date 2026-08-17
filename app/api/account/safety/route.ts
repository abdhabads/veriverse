import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      safety: {
        riskScore: user.riskScore || 0,
        suspiciousFlags: user.suspiciousFlags || 0,
        dailyVoteCount: user.dailyVoteCount || 0,
        dailyVoteCountDate: user.dailyVoteCountDate || "",
        lastVoteAt: user.lastVoteAt || null,
      },
    });
  } catch (error) {
    console.error("GET /api/account/safety error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch safety summary" },
      { status: 500 }
    );
  }
}
