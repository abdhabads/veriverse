import { api } from "@/lib/apiClient";

export async function fetchAdminOverview() {
  const res = await api.get("/admin/overview");
  return res.data;
}

export async function fetchAdminUsers() {
  const res = await api.get("/admin/users");
  return res.data;
}

export async function moderateAdminUser(payload: {
  userId: string;
  action: "warn" | "suspend" | "ban" | "reactivate";
  note?: string;
  suspendHours?: number;
}) {
  const res = await api.patch(`/admin/users/${payload.userId}`, {
    action: payload.action,
    note: payload.note || "",
    suspendHours: payload.suspendHours || 24,
  });
  return res.data;
}

export async function assignAdminUserRole(payload: {
  userId: string;
  role: "user" | "expert" | "admin";
  note?: string;
}) {
  const res = await api.patch(`/admin/users/${payload.userId}`, {
    action: "set_role",
    role: payload.role,
    note: payload.note || "",
  });
  return res.data;
}

export async function fetchAdminQueues(queue = "all") {
  const res = await api.get(`/admin/queues?queue=${encodeURIComponent(queue)}`);
  return res.data;
}

export async function fetchAdminAnalytics() {
  const res = await api.get("/admin/analytics");
  return res.data;
}

export async function fetchAdminTrustAnalytics() {
  const res = await api.get("/admin/trust-analytics");
  return res.data;
}

export async function fetchTrustHealth(limit = 200) {
  const res = await api.get(`/admin/trust-health?limit=${limit}`);
  return res.data;
}

export async function fetchAuditLogs() {
  const res = await api.get("/admin/audit");
  return res.data;
}

export async function fetchAppealsQueue() {
  const res = await api.get("/admin/appeals");
  return res.data;
}

export async function resolveAppeal(payload: {
  appealId: string;
  decision: "approve" | "reject";
  resolutionNote?: string;
}) {
  const res = await api.patch(`/admin/appeals/${payload.appealId}`, {
    decision: payload.decision,
    resolutionNote: payload.resolutionNote || "",
  });
  return res.data;
}

export async function runExport(type: string, format: "json" | "csv" = "json") {
  const res = await fetch(
    `/api/admin/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`,
    {
    method: "GET",
    credentials: "include",
    }
  );

  if (!res.ok) {
    let message = "Export failed";
    try {
      const data = await res.json();
      message = data?.message || message;
    } catch {}
    throw new Error(message);
  }

  const blob = await res.blob();
  const contentDisposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="(.+)"/);
  const filename = filenameMatch?.[1] || `${type}.${format}`;

  return { blob, filename };
}

export async function fetchExpertQueue() {
  const res = await api.get("/expert/queue");
  return res.data;
}

export async function submitExpertDecision(payload: {
  postId: string;
  decision: "verified" | "false" | "disputed";
  note?: string;
}) {
  const res = await api.patch(`/expert/review/${payload.postId}`, {
    decision: payload.decision,
    note: payload.note || "",
  });
  return res.data;
}