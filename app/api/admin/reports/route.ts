import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Report from "@/models/Report";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const reports = await Report.find()
      .populate("reporter", "username email")
      .populate({
        path: "post",
        populate: {
          path: "author",
          model: "User",
          select: "username reputation",
        },
      })
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      reports,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
