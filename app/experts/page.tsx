"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import PageWrapper from "@/components/PageWrapper";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import Toast from "@/components/Toast";
import ExpertCard, { type Expert } from "@/components/ExpertCard";
import { EXPERTISE_DOMAINS, EXPERTISE_DOMAIN_LABELS } from "@/lib/expertiseDomains";

export default function ExpertsPage() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    axios
      .get("/api/me")
      .then((res) => setIsLoggedIn(Boolean(res.data?.user)))
      .catch(() => setIsLoggedIn(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    axios
      .get("/api/experts", { params: domain ? { domain } : {} })
      .then((res) => {
        if (cancelled) return;
        setExperts(res.data.experts || []);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (axios.isAxiosError(error)) {
          setMessage(error.response?.data?.message || "Failed to load experts");
        } else {
          setMessage("Failed to load experts");
        }
        setExperts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  return (
    <PageWrapper
      title="Experts"
      subtitle="Find VeriVerse users whose subject-matter expertise has been recognized by the platform."
    >
      <div className="vv-card p-4 sm:p-5 mb-6">
        <label className="text-xs uppercase tracking-[0.22em] text-slate-500" htmlFor="expert-domain-filter">
          Domain
        </label>
        <select
          id="expert-domain-filter"
          className="vv-select mt-2 w-full sm:w-[220px]"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          <option value="">All domains</option>
          {EXPERTISE_DOMAINS.map((value) => (
            <option key={value} value={value}>
              {EXPERTISE_DOMAIN_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {message && <Toast message={message} type="error" />}

      {loading ? (
        <LoadingSpinner label="Loading experts..." />
      ) : experts.length === 0 ? (
        <EmptyState
          title="No experts found"
          description="VeriVerse hasn't recognized any experts matching this filter yet."
        />
      ) : (
        <div className="space-y-3" data-testid="experts-list">
          {experts.map((expert) => (
            <ExpertCard
              key={expert.id}
              expert={expert}
              isLoggedIn={isLoggedIn}
              onFollowChange={(expertId, following) =>
                setExperts((prev) =>
                  prev.map((item) =>
                    item.id === expertId ? { ...item, follow: { isFollowing: following } } : item
                  )
                )
              }
              onFollowError={setMessage}
            />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
