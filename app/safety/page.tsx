"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Alert from "@/components/ui/Alert";
import Surface from "@/components/ui/Surface";
import AccountSettingsNav from "@/components/AccountSettingsNav";
import SafetyUserRow from "@/components/SafetyUserRow";
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
      <AccountSettingsNav />

      {message && <Alert message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading safety controls..." />
      ) : relations.length === 0 ? (
        <EmptyState
          title="No safety actions yet"
          description="Blocked and muted users will appear here."
        />
      ) : (
        <div className="space-y-6">
          <Surface className="p-5">
            <h2 className="vv-section-title mb-1">Blocked Users</h2>
            <p className="vv-text-body-sm mb-4 text-slate-500">
              Blocking hides a user&apos;s posts from your feed, removes any existing Follow
              relationship between you, and prevents you from messaging, commenting on, or
              reposting each other&apos;s content. It does not delete your prior message or
              comment history, and unblocking will not restore a removed Follow relationship.
            </p>
            {blocked.length === 0 ? (
              <EmptyState title="No blocked users" />
            ) : (
              <div className="space-y-3">
                {blocked.map((item) => (
                  <SafetyUserRow
                    key={`block-${item.targetUser._id}`}
                    displayName={item.targetUser.username || "Unknown user"}
                    avatarUrl={item.targetUser.avatarUrl}
                    profileHref={item.targetUser.username ? `/u/${item.targetUser.username}` : undefined}
                    actionLabel="Unblock"
                    busy={pendingUserId === item.targetUser._id}
                    onAction={() => removeRelation(item.targetUser._id, "block")}
                  />
                ))}
              </div>
            )}
          </Surface>

          <Surface className="p-5">
            <h2 className="vv-section-title mb-1">Muted Users</h2>
            <p className="vv-text-body-sm mb-4 text-slate-500">
              Muting hides a user&apos;s posts from your own feed without notifying them. Unlike
              blocking, it doesn&apos;t remove a Follow relationship or restrict messaging - it
              only changes what you see. The other person can still see and interact with your
              content normally.
            </p>
            {muted.length === 0 ? (
              <EmptyState title="No muted users" />
            ) : (
              <div className="space-y-3">
                {muted.map((item) => (
                  <SafetyUserRow
                    key={`mute-${item.targetUser._id}`}
                    displayName={item.targetUser.username || "Unknown user"}
                    avatarUrl={item.targetUser.avatarUrl}
                    profileHref={item.targetUser.username ? `/u/${item.targetUser.username}` : undefined}
                    actionLabel="Unmute"
                    busy={pendingUserId === item.targetUser._id}
                    onAction={() => removeRelation(item.targetUser._id, "mute")}
                  />
                ))}
              </div>
            )}
          </Surface>

          <p className="vv-text-body-sm text-slate-500">
            Reporting a post or profile is still available directly from that post or profile -
            reports aren&apos;t managed from this page.
          </p>
        </div>
      )}
    </PageWrapper>
  );
}
