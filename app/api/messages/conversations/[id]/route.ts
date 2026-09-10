import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";
import Message from "@/models/Message";
import User from "@/models/User";
import { getUserFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimitGuard";
import { getRateLimitKey } from "@/lib/requestIdentity";
import { cleanString, isValidObjectId } from "@/lib/validation";
import { hasBidirectionalBlock, isUserMessageable } from "@/lib/messaging";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid conversation" },
        { status: 400 }
      );
    }

    const conversation = await Conversation.findById(id).populate(
      "participants",
      "username avatarUrl reputation"
    );

    if (!conversation) {
      return NextResponse.json(
        { success: false, message: "Conversation not found" },
        { status: 404 }
      );
    }

    const isParticipant = (conversation.participants || []).some(
      (participant: any) => String(participant._id) === String(user._id)
    );
    if (!isParticipant) {
      return NextResponse.json(
        { success: false, message: "You are not part of this conversation" },
        { status: 403 }
      );
    }

    const counterpart = (conversation.participants || []).find(
      (participant: any) => String(participant._id) !== String(user._id)
    );

    const recentMessages = await Message.find({ conversation: id })
      .sort({ createdAt: -1 })
      .limit(30);
    const messages = recentMessages.reverse();

    const now = new Date();
    await Conversation.updateOne(
      { _id: id, "participantState.user": user._id },
      { $set: { "participantState.$.lastReadAt": now } }
    );

    const res = NextResponse.json({
      success: true,
      conversation: {
        _id: conversation._id,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview || "",
      },
      counterpart: counterpart
        ? {
            _id: counterpart._id,
            username: counterpart.username,
            avatarUrl: counterpart.avatarUrl || "",
            reputation: Number(counterpart.reputation || 0),
          }
        : null,
      messages: messages.map((message: any) => ({
        _id: message._id,
        conversation: message.conversation,
        sender: message.sender,
        content: message.content,
        createdAt: message.createdAt,
      })),
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    console.error("GET /api/messages/conversations/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch conversation" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, context: RouteContext) {
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
      key: getRateLimitKey(req, "messages-send", String(user._id)),
      windowMs: 60 * 1000,
      max: 60,
      message: "You are sending messages too quickly. Please slow down.",
    });
    if (limitResponse) return limitResponse;

    const { id } = await context.params;
    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid conversation" },
        { status: 400 }
      );
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return NextResponse.json(
        { success: false, message: "Conversation not found" },
        { status: 404 }
      );
    }

    const participantIds = (conversation.participants || []).map((p: any) => String(p));
    if (!participantIds.includes(String(user._id))) {
      return NextResponse.json(
        { success: false, message: "You are not part of this conversation" },
        { status: 403 }
      );
    }

    const { content: rawContent } = await req.json();
    const content = cleanString(rawContent, { maxLength: 2000 });
    if (!content) {
      return NextResponse.json(
        { success: false, message: "Message content is required" },
        { status: 400 }
      );
    }

    const recipientId = participantIds.find((pid: string) => pid !== String(user._id))!;
    const recipient = await User.findById(recipientId);

    if (!recipient || !isUserMessageable(recipient)) {
      return NextResponse.json(
        { success: false, message: "This user is not available to message" },
        { status: 403 }
      );
    }

    if (await hasBidirectionalBlock(String(user._id), recipientId)) {
      return NextResponse.json(
        { success: false, message: "You cannot message this user" },
        { status: 403 }
      );
    }

    const message = await Message.create({
      conversation: id,
      sender: user._id,
      content,
    });

    const now = new Date();
    await Conversation.updateOne(
      { _id: id },
      {
        $set: {
          lastMessageAt: now,
          lastMessagePreview: content.slice(0, 140),
        },
      }
    );
    await Conversation.updateOne(
      { _id: id, "participantState.user": user._id },
      { $set: { "participantState.$.lastReadAt": now } }
    );

    return NextResponse.json(
      {
        success: true,
        message: {
          _id: message._id,
          conversation: message.conversation,
          sender: message.sender,
          content: message.content,
          createdAt: message.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/messages/conversations/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send message" },
      { status: 500 }
    );
  }
}
