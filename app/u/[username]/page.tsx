"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import PageWrapper from "@/components/PageWrapper";
import TrustVerdictBadge from "@/components/TrustVerdictBadge";
import { getAiLabelTone, getDisplayedAiLabel } from "@/lib/trustPresentation";

type User = {
  _id: string;
  username: string;
  email: string;
  bio?: string;
  reputation: number;
  rewardPoints: number;
  avatarUrl?: string;
  badges?: string[];
};

type Post = {
  _id: string;
  content: string;
  status: string;
  aiLabel: string;
  expertDecision?: string;
  verificationScore?: number | null;
  contradictionCount?: number;
  groundingSources?: Array<{
    stance: "supports" | "contradicts" | "context" | "unknown";
  }>;
  accurateVotes: number;
  inaccurateVotes: number;
  createdAt: string;
};

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const resolvedParams = await params;
      const res = await axios.get(`/api/users/${resolvedParams.username}`);
      setUser(res.data.user);
      setPosts(res.data.posts || []);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Failed to load public profile");
    }
  };

  return (
    <PageWrapper title="Public Profile" subtitle="See a contributor's reputation, badges, and published claims.">
      {message && <div className="vv-banner mb-4">{message}</div>}

      {user && (
        <div className="vv-card p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-16 h-16 rounded-full object-cover border border-veriverse-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-veriverse-slate border border-veriverse-border flex items-center justify-center text-sm text-veriverse-dark/60">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
            )}

            <div>
              <h3 className="text-2xl font-semibold">{user.username}</h3>
              <p className="vv-subtitle">Reputation: {user.reputation}</p>
              <p className="vv-subtitle">Reward Points: {user.rewardPoints}</p>
            </div>
          </div>

          <div className="vv-post-panel mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-veriverse-dark/50">
              Bio
            </p>
            {user.bio ? (
              <p className="text-sm leading-6 text-slate-700 whitespace-pre-wrap">{user.bio}</p>
            ) : (
              <p className="text-sm text-slate-500">This user has not added a bio yet.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(user.badges || []).length === 0 ? (
              <span className="vv-subtitle">No badges yet</span>
            ) : (
              user.badges?.map((badge) => (
                <span key={badge} className="vv-pill-blue">{badge}</span>
              ))
            )}
          </div>
        </div>
      )}

      <div className="vv-card p-6">
        <h3 className="vv-section-title mb-4">Posts</h3>

        {posts.length === 0 ? (
          <p className="vv-subtitle">No public posts found.</p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post._id} className="vv-card-soft p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TrustVerdictBadge
                      status={post.status}
                      expertDecision={post.expertDecision}
                      verificationScore={post.verificationScore}
                      contradictionCount={post.contradictionCount}
                      groundingSources={post.groundingSources}
                    />
                    <span className={`vv-verdict-pill vv-verdict-${getAiLabelTone(getDisplayedAiLabel(post))}`}>
                      AI: {getDisplayedAiLabel(post).replaceAll("_", " ")}
                    </span>
                  </div>
                  <span className="text-xs text-veriverse-dark/50">
                    {post.accurateVotes} accurate / {post.inaccurateVotes} inaccurate
                  </span>
                </div>
                <p className="text-sm text-slate-700">{post.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
