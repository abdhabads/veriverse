import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { isValidObjectId } from "@/lib/validation";
import {
  buildParticipantKey,
  hasBidirectionalBlock,
  isUserMessageable,
  sortParticipantPair,
} from "@/lib/messaging";

export async function GET(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const conversations = await Conversation.find({
      "participantState.user": user._id,
    })
      .sort({ lastMessageAt: -1 })
      .limit(20)
      .populate("participants", "username avatarUrl reputation");

    const shaped = conversations.map((conversation: any) => {
      const counterpart = (conversation.participants || []).find(
        (participant: any) => String(participant._id) !== String(user._id)
      );

      const myState = (conversation.participantState || []).find(
        (state: any) => String(state.user) === String(user._id)
      );

      const lastReadAt = myState?.lastReadAt || null;
      const isUnread = Boolean(
        conversation.lastMessageAt &&
          (!lastReadAt || new Date(lastReadAt) < new Date(conversation.lastMessageAt))
      );

      return {
        _id: conversation._id,
        counterpart: counterpart
          ? {
              _id: counterpart._id,
              username: counterpart.username,
              avatarUrl: counterpart.avatarUrl || "",
              reputation: Number(counterpart.reputation || 0),
            }
          : null,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview || "",
        lastReadAt,
        isUnread,
      };
    });

    // Bounded to the same page of conversations already fetched above,
    // matching the existing Notification unreadCount convention (computed
    // over its own bounded limit(30) rather than a separate full count).
    const unreadCount = shaped.filter((conversation) => conversation.isUnread).length;

    const res = NextResponse.json({ success: true, conversations: shaped, unreadCount });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("GET /api/messages/conversations error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const limitResponse = enforceRateLimit({
      key: getRateLimitKey(req, "messages-create", String(user._id)),
      windowMs: 60 * 1000,
      max: 20,
      message: "Too many conversation attempts. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const { targetUserId } = await req.json();

    if (!isValidObjectId(targetUserId)) {
      return NextResponse.json(
        { success: false, message: "Invalid target user" },
        { status: 400 }
      );
    }

    if (String(user._id) === String(targetUserId)) {
      return NextResponse.json(
        { success: false, message: "You cannot message yourself" },
        { status: 400 }
      );
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: "Target user not found" },
        { status: 404 }
      );
    }

    if (!isUserMessageable(targetUser)) {
      return NextResponse.json(
        { success: false, message: "This user is not available to message" },
        { status: 403 }
      );
    }

    if (await hasBidirectionalBlock(String(user._id), String(targetUserId))) {
      return NextResponse.json(
        { success: false, message: "You cannot message this user" },
        { status: 403 }
      );
    }

    const participantKey = buildParticipantKey(String(user._id), String(targetUserId));
    const [participantA, participantB] = sortParticipantPair(String(user._id), String(targetUserId));

    const existing = await Conversation.findOne({ participantKey });
    if (existing) {
      return NextResponse.json({ success: true, conversation: { _id: existing._id } });
    }

    try {
      const created = await Conversation.create({
        participants: [participantA, participantB],
        participantKey,
        participantState: [
          { user: participantA, lastReadAt: null },
          { user: participantB, lastReadAt: null },
        ],
        lastMessageAt: null,
        lastMessagePreview: "",
      });

      return NextResponse.json(
        { success: true, conversation: { _id: created._id } },
        { status: 201 }
      );
    } catch (error: any) {
      // Two concurrent create requests raced on the unique participantKey
      // index - recover by returning the conversation the other request
      // just created instead of failing.
      if (error?.code === 11000) {
        const raced = await Conversation.findOne({ participantKey });
        if (raced) {
          return NextResponse.json({ success: true, conversation: { _id: raced._id } });
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("POST /api/messages/conversations error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to start conversation" },
      { status: 500 }
    );
  }
}
