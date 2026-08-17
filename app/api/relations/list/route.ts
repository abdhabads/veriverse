import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import UserRelation from "@/models/UserRelation";
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

    const relations = await UserRelation.find({
      sourceUser: user._id,
    }).populate("targetUser", "username avatarUrl reputation");

    return NextResponse.json({
      success: true,
      relations,
    });
  } catch (error) {
    console.error("GET /api/relations/list error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch relations" },
      { status: 500 }
    );
  }
}
