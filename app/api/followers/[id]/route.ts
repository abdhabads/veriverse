import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Follow from "@/models/Follow";
import UserRelation from "@/models/UserRelation";
import { getUserIdFromRequest } from "@/lib/auth";
import { isValidObjectId } from "@/lib/validation";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 30;

const now = () => new Date();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const { id } = await context.params;

    const followers = await Follow.countDocuments({ following: id });
    const following = await Follow.countDocuments({ follower: id });

    const searchParams = new URL(req.url).searchParams;
    const mode = searchParams.get("mode");

    // Legacy bare-counts behavior, unchanged, for any existing/future
    // caller that only wants the aggregate numbers.
    if (mode !== "followers" && mode !== "following") {
      return NextResponse.json({ success: true, followers, following });
    }

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid user" },
        { status: 400 }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );
    const skip = (page - 1) * limit;

    // mode=followers -> people who follow `id` (Follow.following = id, the
    // other party is Follow.follower). mode=following -> the reverse.
    const edgeFilterField = mode === "followers" ? "following" : "follower";
    const otherPartyField = mode === "followers" ? "follower" : "following";

    // Requester-specific visibility filtering (block/mute) is optional and
    // only applied when a requester is present - same pattern as search's
    // anonymous-safe filtering.
    const requesterId = getUserIdFromRequest(req);
    let excludedIds: string[] = [];
    if (requesterId) {
      const relations = await UserRelation.find({
        sourceUser: requesterId,
        relationType: { $in: ["block", "mute"] },
      }).select("targetUser");
      excludedIds = relations.map((item: any) => String(item.targetUser));
    }

    // Eligibility (moderation availability + viewer block/mute) is applied
    // via $lookup/$match BEFORE $skip/$limit, so pagination operates on the
    // set of eligible relationships rather than raw Follow edges that may
    // later disappear once an unavailable/excluded user is filtered out.
    // Fetching limit+1 lets hasMore be determined exactly, including the
    // exact-multiple-of-limit case.
    const rows = await Follow.aggregate([
      { $match: { [edgeFilterField]: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: "users",
          localField: otherPartyField,
          foreignField: "_id",
          as: "otherUser",
        },
      },
      { $unwind: "$otherUser" },
      // Mirrors the exact unavailable-account semantics already enforced at
      // login and reused by search (app/api/login/route.ts,
      // app/api/search/route.ts).
      {
        $match: {
          "otherUser.isDeactivated": { $ne: true },
          "otherUser.moderationStatus": { $ne: "banned" },
          $or: [
            { "otherUser.moderationStatus": { $ne: "suspended" } },
            { "otherUser.suspendedUntil": null },
            { "otherUser.suspendedUntil": { $lte: now() } },
          ],
          ...(excludedIds.length > 0
            ? { "otherUser._id": { $nin: excludedIds.map((eid) => new mongoose.Types.ObjectId(eid)) } }
            : {}),
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit + 1 },
      {
        $project: {
          _id: "$otherUser._id",
          username: "$otherUser.username",
          avatarUrl: "$otherUser.avatarUrl",
          reputation: "$otherUser.reputation",
        },
      },
    ]);

    const hasMore = rows.length > limit;
    const users = rows.slice(0, limit).map((user: any) => ({
      _id: user._id,
      username: user.username,
      avatarUrl: user.avatarUrl || "",
      reputation: Number(user.reputation || 0),
    }));

    const res = NextResponse.json({
      success: true,
      followers,
      following,
      users,
      page,
      limit,
      hasMore,
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch follow stats" },
      { status: 500 }
    );
  }
}
