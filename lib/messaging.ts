import UserRelation from "@/models/UserRelation";

export function sortParticipantPair(userIdA: string, userIdB: string): [string, string] {
  return [String(userIdA), String(userIdB)].sort() as [string, string];
}

export function buildParticipantKey(userIdA: string, userIdB: string): string {
  const [a, b] = sortParticipantPair(userIdA, userIdB);
  return `${a}_${b}`;
}

type AvailabilityFields = {
  isDeactivated?: boolean;
  moderationStatus?: string;
  suspendedUntil?: Date | string | null;
};

// Mirrors the exact unavailable-account semantics already enforced at login
// and reused by search (app/api/login/route.ts, app/api/search/route.ts):
// deactivated, banned, or currently-suspended accounts. An expired
// suspension is not treated as unavailable.
export function isUserMessageable(user: AvailabilityFields): boolean {
  if (user.isDeactivated) return false;
  if (user.moderationStatus === "banned") return false;
  if (
    user.moderationStatus === "suspended" &&
    user.suspendedUntil &&
    new Date(user.suspendedUntil) > new Date()
  ) {
    return false;
  }
  return true;
}

// Messaging uses a stricter, bidirectional block rule than Feed/Search
// (which only ever filter what the requester themselves has blocked/muted).
// If either side has blocked the other, messaging is forbidden in both
// directions. Mute never affects messaging permission.
export async function hasBidirectionalBlock(userIdA: string, userIdB: string): Promise<boolean> {
  const block = await UserRelation.findOne({
    relationType: "block",
    $or: [
      { sourceUser: userIdA, targetUser: userIdB },
      { sourceUser: userIdB, targetUser: userIdA },
    ],
  }).select("_id");

  return Boolean(block);
}
