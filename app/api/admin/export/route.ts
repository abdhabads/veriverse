import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import User from "@/models/User";
import Post from "@/models/Post";
import Report from "@/models/Report";
import Appeal from "@/models/Appeal";
import AuditLog from "@/models/AuditLog";
import RewardLog from "@/models/RewardLog";
import ReputationLog from "@/models/ReputationLog";

const ALLOWED_EXPORT_TYPES = new Set([
  "users",
  "posts",
  "reports",
  "appeals",
  "audit",
  "rewards",
  "reputation",
  "trust-summary",
]);

const ALLOWED_EXPORT_FORMATS = new Set(["json", "csv"]);

function createJsonDownloadResponse(type: string, payload: unknown) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `veriverse-${type}-${timestamp}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function flattenRecord(
  value: unknown,
  prefix = "",
  target: Record<string, string> = {}
): Record<string, string> {
  if (value === null || value === undefined) {
    if (prefix) {
      target[prefix] = "";
    }
    return target;
  }

  if (value instanceof Date) {
    if (prefix) {
      target[prefix] = value.toISOString();
    }
    return target;
  }

  if (Array.isArray(value)) {
    if (prefix) {
      const hasComplexItem = value.some(
        (item) => item && typeof item === "object" && !(item instanceof Date)
      );
      target[prefix] = hasComplexItem ? JSON.stringify(value) : value.join(" | ");
    }
    return target;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      if (prefix) {
        target[prefix] = "";
      }
      return target;
    }

    for (const [key, nestedValue] of entries) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenRecord(nestedValue, nextPrefix, target);
    }

    return target;
  }

  if (prefix) {
    target[prefix] = String(value);
  }

  return target;
}

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildCsvString(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "No data\n";
  }

  const flattenedRows = rows.map((row) => flattenRecord(row));
  const headers = Array.from(
    new Set(flattenedRows.flatMap((row) => Object.keys(row)))
  );

  const lines = [headers.join(",")];

  for (const row of flattenedRows) {
    const values = headers.map((header) => escapeCsvValue(row[header] || ""));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function buildCsvRows(type: string, payload: Record<string, unknown>) {
  const exportedAt = String(payload.exportedAt || "");

  if (Array.isArray(payload.records)) {
    return (payload.records as Array<Record<string, unknown>>).map((record) => ({
      exportType: type,
      exportedAt,
      ...record,
    }));
  }

  if (type === "trust-summary") {
    const summary = payload as {
      metrics?: Record<string, unknown>;
      highRiskPosts?: Array<Record<string, unknown>>;
    };

    const metricRow = {
      section: "metrics",
      exportType: type,
      exportedAt,
      ...(summary.metrics || {}),
    };

    const highRiskRows = (summary.highRiskPosts || []).map((record) => ({
      section: "highRiskPosts",
      exportType: type,
      exportedAt,
      ...record,
    }));

    return [metricRow, ...highRiskRows];
  }

  return [
    {
      exportType: type,
      exportedAt,
      ...payload,
    },
  ];
}

function createCsvDownloadResponse(type: string, payload: Record<string, unknown>) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `veriverse-${type}-${timestamp}.csv`;
  const rows = buildCsvRows(type, payload);
  const csv = buildCsvString(rows);

  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function buildTrustSummary() {
  const [
    totalUsers,
    totalPosts,
    finalizedPosts,
    flaggedPosts,
    expertReviewPosts,
    appealReviewPosts,
    totalReports,
    pendingReports,
    totalAppeals,
    pendingAppeals,
    totalAuditLogs,
    highRiskPosts,
    avgVerificationResult,
    lowVerificationCount,
  ] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Post.countDocuments({ finalized: true }),
    Post.countDocuments({ status: "flagged" }),
    Post.countDocuments({ status: "under_expert_review" }),
    Post.countDocuments({ status: "under_appeal_review" }),
    Report.countDocuments(),
    Report.countDocuments({ status: "pending" }),
    Appeal.countDocuments(),
    Appeal.countDocuments({ status: { $in: ["pending", "under_review"] } }),
    AuditLog.countDocuments(),
    Post.find({ aiRiskScore: { $gte: 35 } })
      .select("content status aiRiskScore author createdAt")
      .populate("author", "username reputation")
      .sort({ aiRiskScore: -1, createdAt: -1 })
      .limit(25)
      .lean(),
    // Excludes "question"/"instruction" posts - grounding is skipped for
    // those, so their verificationScore is a structural default (not a
    // real "weak evidence" signal), and mixing them in here would silently
    // reintroduce the exact category error the contentType classifier was
    // built to fix, just at the dashboard-metrics layer instead of the
    // per-post verdict layer. $nin also matches documents missing the
    // field entirely (posts created before this field existed), which is
    // correct - those predate rhetorical/non-claim classification and are
    // ordinary claims.
    Post.aggregate([
      { $match: { contentType: { $nin: ["question", "instruction"] } } },
      { $group: { _id: null, avg: { $avg: "$verificationScore" } } },
    ]),
    Post.countDocuments({
      verificationScore: { $lt: 0.3, $gt: 0 },
      contentType: { $nin: ["question", "instruction"] },
    }),
  ]);

  return {
    metrics: {
      totalUsers,
      totalPosts,
      finalizedPosts,
      flaggedPosts,
      expertReviewPosts,
      appealReviewPosts,
      totalReports,
      pendingReports,
      totalAppeals,
      pendingAppeals,
      totalAuditLogs,
      avgVerificationScore: Number((avgVerificationResult[0]?.avg ?? 0).toFixed(3)),
      lowVerificationCount,
    },
    highRiskPosts,
  };
}

async function getExportPayload(type: string) {
  switch (type) {
    case "users": {
      const records = await User.find()
        .select("-password -passwordResetTokenHash -passwordResetExpiresAt")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "posts": {
      const records = await Post.find()
        .select(
          "content status aiLabel aiRiskScore verificationScore " +
          "groundingStatus groundingConfidence contradictionCount supportCount " +
          "contentType extractedClaim " +
          "moderationReasons needsExpertReview expertDecision finalized " +
          "hashtags createdAt updatedAt author"
        )
        .populate("author", "username email role reputation")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "reports": {
      const records = await Report.find()
        .populate("reporter", "username email reputation")
        .populate("post", "content status")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "appeals": {
      const records = await Appeal.find()
        .populate("appellant", "username email reputation")
        .populate("post", "content status")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "audit": {
      const records = await AuditLog.find()
        .populate("actor", "username role")
        .populate("targetUser", "username role reputation")
        .populate("targetPost", "content status")
        .populate("targetAppeal", "status reason")
        .populate("targetReport", "status reason")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "rewards": {
      const records = await RewardLog.find()
        .populate("user", "username email reputation rewardPoints")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "reputation": {
      const records = await ReputationLog.find()
        .populate("user", "username email reputation")
        .sort({ createdAt: -1 })
        .lean();
      return { records, count: records.length };
    }

    case "trust-summary": {
      return buildTrustSummary();
    }

    default:
      return null;
  }
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);

    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "").trim();
    const format = (searchParams.get("format") || "json").trim().toLowerCase();

    if (!ALLOWED_EXPORT_TYPES.has(type)) {
      return NextResponse.json(
        { success: false, message: "Invalid export type" },
        { status: 400 }
      );
    }

    if (!ALLOWED_EXPORT_FORMATS.has(format)) {
      return NextResponse.json(
        { success: false, message: "Invalid export format" },
        { status: 400 }
      );
    }

    const payload = await getExportPayload(type);

    if (!payload) {
      return NextResponse.json(
        { success: false, message: "Export type not supported" },
        { status: 400 }
      );
    }

    const responsePayload = {
      success: true,
      exportType: type,
      exportedAt: new Date().toISOString(),
      ...payload,
    };

    if (format === "csv") {
      return createCsvDownloadResponse(type, responsePayload);
    }

    return createJsonDownloadResponse(type, responsePayload);
  } catch (error) {
    console.error("GET /api/admin/export error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to generate export" },
      { status: 500 }
    );
  }
}