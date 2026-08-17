import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Appeal from "@/models/Appeal";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const appeals = await Appeal.find()
      .populate("appellant", "username reputation avatarUrl")
      .populate({
        path: "post",
        populate: {
          path: "author",
          model: "User",
          select: "username reputation avatarUrl",
        },
      })
      .populate("reviewedBy", "username")
      .sort({ createdAt: -1 });

    return NextResponse.json({
      success: true,
      appeals,
    });
  } catch (error) {
    console.error("GET /api/admin/appeals error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch appeals" },
      { status: 500 }
    );
  }
}
