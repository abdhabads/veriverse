"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Surface from "@/components/ui/Surface";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { usePageState } from "@/hooks/usePageState";
import {
  fetchMySafetyRelations,
  toggleSafetyRelation,
} from "@/lib/profileTrustClient";
import { getErrorMessage } from "@/lib/apiClient";
import { runMutation } from "@/lib/runMutation";

type Relation = {
  _id?: string;
  relationType: "block" | "mute";
  targetUser: {
    _id: string;
    username?: string;
    reputation?: number;
    avatarUrl?: string;
  };
};

export default function SafetyPage() {
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

  const [relations, setRelations] = useState<Relation[]>([]);
  const [pendingUserId, setPendingUserId] = useState("");

  useEffect(() => {
    loadSafety();
  }, []);

  async function loadSafety() {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) return;

      const data = await fetchMySafetyRelations();
      setRelations(data.relations || []);
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load safety controls"));
    } finally {
      setLoading(false);
    }
  }

  async function removeRelation(targetUserId: string, relationType: "block" | "mute") {
    setPendingUserId(targetUserId);

    await runMutation({
      action: () =>
        toggleSafetyRelation({
          targetUserId,
          relationType,
        }),
      onSuccess: () => {
        setRelations((prev) =>
          prev.filter(
            (item) =>
              !(
                item.relationType === relationType &&
                String(item.targetUser?._id) === String(targetUserId)
              )
          )
        );
        showSuccess(
          relationType === "block" ? "User unblocked." : "User unmuted."
        );
      },
      onError: showError,
      onFinally: () => setPendingUserId(""),
    });
  }

  const blocked = relations.filter((item) => item.relationType === "block");
  const muted = relations.filter((item) => item.relationType === "mute");

  return (
    <PageWrapper
      title="Safety Controls"
      subtitle="Manage blocked and muted users."
    >
      {message && <Alert message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading safety controls..." />
      ) : relations.length === 0 ? (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => router.push("/profile")}>
              Back to Profile
            </Button>
          </div>

          <EmptyState
            title="No safety actions yet"
            description="Blocked and muted users will appear here."
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => router.push("/profile")}>
              Back to Profile
            </Button>
          </div>

          <Surface className="p-5">
            <h2 className="vv-section-title mb-4">Blocked Users</h2>
            {blocked.length === 0 ? (
              <p className="vv-text-body-sm">No blocked users.</p>
            ) : (
              <div className="space-y-3">
                {blocked.map((item) => (
                  <Surface tone="soft" key={`block-${item.targetUser._id}`} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="vv-text-card-title">
                          {item.targetUser.username || "Unknown User"}
                        </p>
                        <p className="vv-text-meta">
                          Reputation: {Number(item.targetUser.reputation || 0)}
                        </p>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeRelation(item.targetUser._id, "block")}
                        loading={pendingUserId === item.targetUser._id}
                      >
                        {pendingUserId === item.targetUser._id ? "Working..." : "Unblock"}
                      </Button>
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </Surface>

          <Surface className="p-5">
            <h2 className="vv-section-title mb-4">Muted Users</h2>
            {muted.length === 0 ? (
              <p className="vv-text-body-sm">No muted users.</p>
            ) : (
              <div className="space-y-3">
                {muted.map((item) => (
                  <Surface tone="soft" key={`mute-${item.targetUser._id}`} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="vv-text-card-title">
                          {item.targetUser.username || "Unknown User"}
                        </p>
                        <p className="vv-text-meta">
                          Reputation: {Number(item.targetUser.reputation || 0)}
                        </p>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeRelation(item.targetUser._id, "mute")}
                        loading={pendingUserId === item.targetUser._id}
                      >
                        {pendingUserId === item.targetUser._id ? "Working..." : "Unmute"}
                      </Button>
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </Surface>
        </div>
      )}
    </PageWrapper>
  );
}
