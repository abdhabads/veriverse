import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Appeal from "@/models/Appeal";
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

    const appeals = await Appeal.find({ appellant: user._id })
      .populate("post", "content status trustDecisionVersion aiLabel verificationScore")
      .populate("reviewedBy", "username")
      .sort({ createdAt: -1 })
      .limit(100);

    return NextResponse.json({
      success: true,
      appeals,
    });
  } catch (error) {
    console.error("GET /api/appeals/me error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load appeals" },
      { status: 500 }
    );
  }
}