import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { getUserFromRequest, requireActiveUser } from "@/lib/auth";

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

    const notifications = await Notification.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = notifications.reduce(
      (count, notification) => count + (notification.isRead ? 0 : 1),
      0
    );

    const res = NextResponse.json({
      success: true,
      notifications,
      unreadCount,
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await connectDB();
    const guard = await requireActiveUser(req);
    if (guard.errorResponse) return guard.errorResponse;
    const user = guard.user;

    await Notification.updateMany(
      { user: user._id, isRead: false },
      { isRead: true }
    );

    return NextResponse.json({
      success: true,
      message: "Notifications marked as read",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to update notifications" },
      { status: 500 }
    );
  }
}