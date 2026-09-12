import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Claim from "@/models/Claim";
import ClaimFollow from "@/models/ClaimFollow";
import { requireActiveUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { isValidObjectId } from "@/lib/validation";
import { fail } from "@/lib/apiResponse";

// P3.3: deliberately NOT a toggle endpoint like /api/follow. ClaimFollow is
// the durable subscription relation P3.4's notification fanout will read
// from, so its mutations must be idempotent under ordinary retries (a lost
// response followed by a client retry must never flip a follow into an
// unfollow the way a toggle would). POST always ensures "following";
// DELETE always ensures "not following". Repeating either leaves the same
// final state.
//
// No block/mute check anywhere in this file - a Claim is not a user, and
// hasBidirectionalBlock()/relation helpers are hard-typed to two user ids.
// Blocking or muting a post's author must never prevent following the
// underlying Claim. No Notification import/creation either - P3.3 stores
// only the subscription row; P3.4 owns Claim-change notification behavior.

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id } = await context.params;

    if (!isValidObjectId(id)) {
      return fail("Invalid claim ID", 400);
    }

    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "claim-follow", String(user._id)),
      windowMs: 60 * 1000,
      max: 30,
      message: "Too many follow actions. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const claim = await Claim.findById(id).select("_id");
    if (!claim) {
      return fail("Claim not found", 404);
    }

    // Atomic ensure-exists: never creates a duplicate row, never depends on
    // a prior read, and is safe under a genuine concurrent double-POST -
    // the unique {user,claim} index is the database-level guarantee this
    // relies on, not a separate transaction.
    await ClaimFollow.updateOne(
      { user: user._id, claim: claim._id },
      { $setOnInsert: { user: user._id, claim: claim._id } },
      { upsert: true }
    );

    return NextResponse.json({ success: true, following: true });
  } catch {
    return fail("Failed to follow claim", 500);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id } = await context.params;

    if (!isValidObjectId(id)) {
      return fail("Invalid claim ID", 400);
    }

    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

    const claim = await Claim.findById(id).select("_id");
    if (!claim) {
      return fail("Claim not found", 404);
    }

    // Ensure-absent: succeeds identically whether or not a row existed -
    // repeating DELETE is always harmless.
    await ClaimFollow.deleteOne({ user: user._id, claim: claim._id });

    return NextResponse.json({ success: true, following: false });
  } catch {
    return fail("Failed to unfollow claim", 500);
  }
}
