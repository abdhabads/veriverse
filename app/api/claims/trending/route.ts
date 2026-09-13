import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { fail } from "@/lib/apiResponse";
import { getTrendingClaims } from "@/lib/trendingClaims";

// Public: trending reflects attention, not a truth verdict, so it carries no
// more sensitivity than the Claim page itself (also public). Per-viewer
// personalization is limited to follow.isFollowing and which representative
// Post is shown (block/mute) - the ranking itself is identical for everyone.
export async function GET(req: Request) {
  try {
    await connectDB();
    const requesterId = getUserIdFromRequest(req);

    const claims = await getTrendingClaims({ requesterId });

    return NextResponse.json(
      { success: true, claims },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return fail("Failed to fetch trending claims", 500);
  }
}
