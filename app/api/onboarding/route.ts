import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";

const ALLOWED_INTERESTS = new Set([
  "health",
  "social",
  "politics",
  "tech",
  "finance",
  "climate",
]);

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

    return NextResponse.json({
      success: true,
      onboardingCompleted: Boolean(user.onboardingCompleted),
      interests: Array.isArray(user.interests) ? user.interests : [],
    });
  } catch (error) {
    console.error("GET /api/onboarding error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load onboarding" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  await connectDB();

  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const skip = body?.skip === true;
    const interests = Array.isArray(body?.interests)
      ? body.interests
          .filter((value: unknown): value is string => typeof value === "string")
          .map((value: string) => value.trim().toLowerCase())
          .filter((value: string) => ALLOWED_INTERESTS.has(value))
      : [];

    if (!skip && interests.length === 0) {
      return NextResponse.json(
        { success: false, message: "Select at least one valid interest." },
        { status: 400 }
      );
    }

    if (!skip) {
      user.interests = Array.from(new Set(interests));
    }

    user.onboardingCompleted = true;
    await user.save();

    return NextResponse.json({
      success: true,
      message: skip ? "Onboarding skipped successfully" : "Onboarding saved successfully",
      onboardingCompleted: true,
      interests: user.interests,
    });
  } catch (error) {
    console.error("PATCH /api/onboarding error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save onboarding" },
      { status: 500 }
    );
  }
}