import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Follow from "@/models/Follow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  await connectDB();

  try {
    const { id } = await context.params;

    const followers = await Follow.countDocuments({ following: id });
    const following = await Follow.countDocuments({ follower: id });

    return NextResponse.json({
      success: true,
      followers,
      following,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch follow stats" },
      { status: 500 }
    );
  }
}
