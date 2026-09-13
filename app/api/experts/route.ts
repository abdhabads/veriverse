import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import UserRelation from "@/models/UserRelation";
import Follow from "@/models/Follow";
import { getUserIdFromRequest } from "@/lib/auth";
import { fail } from "@/lib/apiResponse";
import { EXPERTISE_DOMAINS, EXPERTISE_DOMAIN_LABELS, isExpertiseDomain } from "@/lib/expertiseDomains";

// Mirrors the exact unavailable-account semantics already proven across
// search/topics/claims/trending (app/api/search/route.ts and siblings).
const now = () => new Date();
function unavailableUserFilter() {
  return {
    $or: [
      { isDeactivated: true },
      { moderationStatus: "banned" },
      { moderationStatus: "suspended", suspendedUntil: { $gt: now() } },
    ],
  };
}

const DIRECTORY_LIMIT = 50;

// P3.6: public - an expert directory carries no more sensitivity than the
// public profile page itself (also public), and only exposes the audit-
// approved safe fields (expertise domains, a short credential summary) -
// never internal admin/review/verification metadata.
export async function GET(req: Request) {
  try {
    await connectDB();
    const requesterId = getUserIdFromRequest(req);

    const { searchParams } = new URL(req.url);
    const domainParam = searchParams.get("domain");
    if (domainParam && !isExpertiseDomain(domainParam)) {
      return fail(`Invalid expertise domain - must be one of: ${EXPERTISE_DOMAINS.join(", ")}`, 400);
    }

    let excludedIds: string[] = [];
    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");
      excludedIds = relations.map((item: any) => String(item.targetUser));
    }
    const moderationExcluded = await User.find(unavailableUserFilter()).select("_id");
    excludedIds = [...excludedIds, ...moderationExcluded.map((item: any) => String(item._id))];

    // Neutral, non-normative ordering: alphabetical by username within
    // domain grouping - never by reputation, verification score, follower
    // count, or any Claim-truth outcome.
    const experts = await User.find({
      role: "expert",
      ...(domainParam ? { expertiseDomains: domainParam } : {}),
      ...(excludedIds.length > 0 ? { _id: { $nin: excludedIds } } : {}),
    })
      .select("username avatarUrl bio expertiseDomains expertCredentialSummary")
      .sort({ expertiseDomains: 1, username: 1 })
      .limit(DIRECTORY_LIMIT);

    let followedIds = new Set<string>();
    if (requesterId && experts.length > 0) {
      const follows = await Follow.find({
        follower: requesterId,
        following: { $in: experts.map((expert: any) => expert._id) },
      }).select("following");
      followedIds = new Set(follows.map((item: any) => String(item.following)));
    }

    const payload = experts.map((expert: any) => ({
      id: String(expert._id),
      username: expert.username,
      avatarUrl: expert.avatarUrl || "",
      bio: expert.bio || "",
      expertise: (expert.expertiseDomains || []).map((domain: string) => ({
        domain,
        label: EXPERTISE_DOMAIN_LABELS[domain as keyof typeof EXPERTISE_DOMAIN_LABELS] || domain,
      })),
      credentialSummary: expert.expertCredentialSummary || "",
      follow: { isFollowing: followedIds.has(String(expert._id)) },
    }));

    return NextResponse.json(
      { success: true, experts: payload },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return fail("Failed to fetch experts", 500);
  }
}
