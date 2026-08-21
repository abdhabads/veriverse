import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import AuditLog from "@/models/AuditLog";
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

    const logs = await AuditLog.find()
      .populate("actor", "username role")
      .populate("targetPost", "content status")
      .populate("targetAppeal", "status reason")
      .populate("targetReport", "status reason")
      .populate("targetUser", "username reputation")
      .sort({ createdAt: -1 })
      .limit(200);

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("GET /api/admin/audit error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
