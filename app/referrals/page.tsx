"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import Toast from "@/components/Toast";
import { usePageState } from "@/hooks/usePageState";
import { requireAuthenticated } from "@/lib/frontendAccess";
import { api, getErrorMessage } from "@/lib/apiClient";

type ReferralStats = {
  referralCode: string;
  joinedCount: number;
  activatedCount: number;
  communityBuilderTier: {
    tier: "none" | "community_builder";
    progressToNextTier: number;
    nextTierThreshold: number;
  };
};

export default function ReferralsPage() {
  const router = useRouter();
  const { loading, setLoading, message, messageType, showSuccess, showError, clearMessage } =
    usePageState();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referralLink, setReferralLink] = useState("");

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      clearMessage();

      const user = await requireAuthenticated(router);
      if (!user) {
        return;
      }

      const res = await api.get("/referrals");
      setStats(res.data);

      if (typeof window !== "undefined") {
        setReferralLink(`${window.location.origin}/register?ref=${res.data.referralCode}`);
      }
    } catch (error: any) {
      showError(getErrorMessage(error, "Failed to load referral stats"));
    } finally {
      setLoading(false);
    }
  }, [clearMessage, router, setLoading, showError]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      showSuccess("Referral link copied");
    } catch {
      showError("Could not copy the link. Please copy it manually.");
    }
  };

  const shareLink = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join VeriVerse",
          text: "Join me on VeriVerse - a community built on evidence-first, trust-driven conversation.",
          url: referralLink,
        });
      } catch {
        // User cancelled the native share sheet - not an error.
      }
      return;
    }

    void copyLink();
  };

  return (
    <PageWrapper
      title="Grow the VeriVerse Community"
      subtitle="Invite people who will genuinely participate - verify claims, weigh evidence, and hold conversations accountable. Referral recognizes community growth, not truth authority."
    >
      {message && <Toast message={message} type={messageType} />}

      {loading ? (
        <LoadingSpinner label="Loading your referral stats..." />
      ) : (
        stats && (
          <div className="space-y-6">
            <div className="vv-card p-5">
              <h3 className="vv-section-title mb-3">Your referral link</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  readOnly
                  value={referralLink}
                  data-testid="referral-link"
                  className="vv-input flex-1"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  data-testid="referral-copy"
                  onClick={copyLink}
                  className="vv-btn-secondary"
                >
                  Copy
                </button>
                <button
                  type="button"
                  data-testid="referral-share"
                  onClick={shareLink}
                  className="vv-btn-primary"
                >
                  Share
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="vv-card-soft p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Joined</p>
                <p className="text-3xl font-bold text-veriverse-dark" data-testid="referral-joined-count">
                  {stats.joinedCount}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  People who registered with your link.
                </p>
              </div>
              <div className="vv-card-soft p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Activated</p>
                <p className="text-3xl font-bold text-veriverse-dark" data-testid="referral-activated-count">
                  {stats.activatedCount}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Of those, people who completed onboarding and posted.
                </p>
              </div>
            </div>

            <div className="vv-card p-5">
              <h3 className="vv-section-title mb-2">Community Builder</h3>
              {stats.communityBuilderTier.tier === "community_builder" ? (
                <p className="text-sm text-slate-700">
                  You're a <span className="font-semibold">Community Builder</span> - {stats.activatedCount} of the
                  people you invited have genuinely joined the conversation.
                </p>
              ) : (
                <p className="text-sm text-slate-700">
                  {stats.communityBuilderTier.progressToNextTier} / {stats.communityBuilderTier.nextTierThreshold}{" "}
                  activated referrals toward Community Builder recognition.
                </p>
              )}
            </div>
          </div>
        )
      )}
    </PageWrapper>
  );
}
