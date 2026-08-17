"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { useProtectedRolePage } from "@/hooks/useProtectedRolePage";
import {
  assignAdminUserRole,
  fetchAdminUsers,
  moderateAdminUser,
} from "@/lib/adminClient";
import { runMutation } from "@/lib/runMutation";
import { getErrorMessage } from "@/lib/apiClient";

type ManagedUser = {
  _id: string;
  username?: string;
  email?: string;
  role?: string;
  reputation: number;
  rewardPoints: number;
  moderationStatus?: string;
  moderationNote?: string;
  suspendedUntil?: string | null;
  riskScore?: number;
  suspiciousFlags?: number;
  avatarUrl?: string;
};

function getUserDisplayName(user: Partial<ManagedUser>) {
  return user.username?.trim() || user.email?.trim() || "Unknown user";
}

function getUserInitial(user: Partial<ManagedUser>) {
  const label = getUserDisplayName(user);
  return label.slice(0, 1).toUpperCase();
}

export default function AdminUsersPage() {
  const router = useRouter();
  const {
    loading,
    setLoading,
    message,
    messageType,
    showError,
    showSuccess,
    clearMessage,
  } = usePageState();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<string, "user" | "expert" | "admin">>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingUserId, setPendingUserId] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const data = await fetchAdminUsers();
      const nextUsers = data.users || [];
      setUsers(nextUsers);
      setRoleDrafts((prev) => {
        const next = { ...prev };
        for (const user of nextUsers) {
          const userId = String(user._id);
          const role = user.role;
          if (role === "user" || role === "expert" || role === "admin") {
            next[userId] = role;
          } else if (!next[userId]) {
            next[userId] = "user";
          }
        }
        return next;
      });
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearMessage, showError]);

  useProtectedRolePage("admin", loadUsers);

  async function handleModeration(
    userId: string,
    action: "warn" | "suspend" | "ban" | "reactivate"
  ) {
    if (action === "ban") {
      const confirmed = window.confirm("Are you sure you want to ban this user?");
      if (!confirmed) return;
    }

    setPendingUserId(userId);

    await runMutation({
      action: () =>
        moderateAdminUser({
          userId,
          action,
          note: notes[userId] || "",
          suspendHours: 24,
        }),
      onSuccess: (data) => {
        setUsers((prev) =>
          prev.map((user) =>
            String(user._id) === String(userId)
              ? {
                  ...user,
                  moderationStatus: data.user?.moderationStatus || user.moderationStatus,
                  moderationNote: data.user?.moderationNote || notes[userId] || "",
                  suspendedUntil: data.user?.suspendedUntil || null,
                }
              : user
          )
        );
        showSuccess(`User action "${action}" applied.`);
      },
      onError: showError,
      onFinally: () => setPendingUserId(""),
    });
  }

  async function handleRoleAssignment(
    userId: string,
    role: "user" | "expert" | "admin"
  ) {
    const targetUser = users.find((user) => String(user._id) === String(userId));
    const currentRole = targetUser?.role || "user";

    if (currentRole === role) {
      showError("This user already has that role.");
      return;
    }

    const confirmed = window.confirm(`Assign role "${role}" to ${getUserDisplayName(targetUser || { _id: userId })}?`);
    if (!confirmed) return;

    setPendingUserId(userId);

    await runMutation({
      action: () =>
        assignAdminUserRole({
          userId,
          role,
          note: notes[userId] || "",
        }),
      onSuccess: (data) => {
        setUsers((prev) =>
          prev.map((user) =>
            String(user._id) === String(userId)
              ? {
                  ...user,
                  role: data.user?.role || role,
                }
              : user
          )
        );
        setRoleDrafts((prev) => ({
          ...prev,
          [userId]: data.user?.role || role,
        }));
        showSuccess(`User role updated to "${data.user?.role || role}".`);
      },
      onError: showError,
      onFinally: () => setPendingUserId(""),
    });
  }

  const filteredUsers = users.filter((user) => {
    const q = searchTerm.toLowerCase();
    const username = user.username?.toLowerCase() || "";
    const email = user.email?.toLowerCase() || "";
    const moderationStatus = user.moderationStatus?.toLowerCase() || "";

    return (
      username.includes(q) ||
      email.includes(q) ||
      moderationStatus.includes(q)
    );
  });

  return (
    <PageWrapper
      title="Admin User Management"
      subtitle="Warn, suspend, ban, and reactivate user accounts."
    >
      {message && <Toast message={message} type={messageType} />}

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => router.push("/admin")} className="vv-btn-secondary">
          Back to Admin
        </button>
        <button onClick={loadUsers} className="vv-btn-secondary">
          Refresh
        </button>
      </div>

      <div className="vv-card mb-6 p-5">
        <h2 className="vv-section-title mb-3">Search Users</h2>
        <input
          className="vv-input"
          placeholder="Search by username, email, or moderation status"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <LoadingSpinner label="Loading users..." />
      ) : filteredUsers.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((user) => (
            <div key={user._id} className="vv-card p-5">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-4">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={getUserDisplayName(user)}
                      className="h-12 w-12 rounded-full border object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-slate-200 text-sm text-slate-500">
                      {getUserInitial(user)}
                    </div>
                  )}

                  <div>
                    <p className="font-semibold text-veriverse-dark">{getUserDisplayName(user)}</p>
                    <p className="text-sm text-slate-600">{user.email || "No email available"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="vv-pill-gray">Role: {user.role || "user"}</span>
                      <span className="vv-pill-blue">Rep: {user.reputation}</span>
                      <span className="vv-pill-purple">Rewards: {user.rewardPoints}</span>
                      <span className="vv-pill-red">Status: {user.moderationStatus || "active"}</span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-600">
                  <p>Risk Score: {Number(user.riskScore || 0)}</p>
                  <p>Flags: {Number(user.suspiciousFlags || 0)}</p>
                  {user.suspendedUntil ? (
                    <p>
                      Suspended Until: {new Date(user.suspendedUntil).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </div>

              {user.moderationNote ? (
                <div className="vv-card-soft mb-3 p-3">
                  <p className="text-sm text-slate-700">
                    Current moderation note: {user.moderationNote}
                  </p>
                </div>
              ) : null}

              <textarea
                className="vv-textarea mb-3"
                rows={3}
                placeholder="Add moderation note"
                value={notes[user._id] || ""}
                onChange={(e) =>
                  setNotes((prev) => ({
                    ...prev,
                    [user._id]: e.target.value,
                  }))
                }
              />

              <div className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1">
                  <p className="mb-2 text-sm font-medium text-veriverse-dark">Assign Role</p>
                  <select
                    className="vv-input"
                    value={roleDrafts[user._id] || "user"}
                    onChange={(e) =>
                      setRoleDrafts((prev) => ({
                        ...prev,
                        [user._id]: e.target.value as "user" | "expert" | "admin",
                      }))
                    }
                    disabled={pendingUserId === user._id}
                  >
                    <option value="user">User</option>
                    <option value="expert">Expert</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <button
                  onClick={() => handleRoleAssignment(user._id, roleDrafts[user._id] || "user")}
                  disabled={pendingUserId === user._id}
                  className="vv-btn-primary"
                >
                  {pendingUserId === user._id ? "Working..." : "Apply Role"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleModeration(user._id, "warn")}
                  disabled={pendingUserId === user._id}
                  className="vv-btn-secondary"
                >
                  {pendingUserId === user._id ? "Working..." : "Warn"}
                </button>

                <button
                  onClick={() => handleModeration(user._id, "suspend")}
                  disabled={pendingUserId === user._id}
                  className="vv-btn-secondary"
                >
                  {pendingUserId === user._id ? "Working..." : "Suspend 24h"}
                </button>

                <button
                  onClick={() => handleModeration(user._id, "ban")}
                  disabled={pendingUserId === user._id}
                  className="vv-btn-danger"
                >
                  {pendingUserId === user._id ? "Working..." : "Ban"}
                </button>

                <button
                  onClick={() => handleModeration(user._id, "reactivate")}
                  disabled={pendingUserId === user._id}
                  className="vv-btn-accent"
                >
                  {pendingUserId === user._id ? "Working..." : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}