"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { getDisplayedAiLabel } from "@/lib/trustPresentation";

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
  const router = useRouter();
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
    <div className="vv-page">
      <div className="vv-navbar">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="vv-title">VeriVerse</h1>
            <p className="text-sm text-slate-300">Verify. Trust. Earn.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => router.push("/feed")} className="vv-btn-nav">Feed</button>
            <button onClick={() => router.push("/search")} className="vv-btn-nav">Search</button>
          </div>
        </div>
      </div>

      <div className="vv-container">
        <h2 className="vv-title mb-6">Public Profile</h2>

        {message && (
          <div className="vv-banner mb-4">{message}</div>
        )}

        {user && (
          <div className="vv-card p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-4">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-16 h-16 rounded-full object-cover border"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-200 border flex items-center justify-center text-sm text-slate-500">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div>
                <h3 className="text-2xl font-semibold">{user.username}</h3>
                <p className="vv-subtitle">Reputation: {user.reputation}</p>
                <p className="vv-subtitle">Reward Points: {user.rewardPoints}</p>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
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
                  <p className="mb-2 text-sm">{post.content}</p>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p>Status: {post.status}</p>
                    <p>AI Signal: {getDisplayedAiLabel(post).replaceAll("_", " ")}</p>
                    <p>
                      Votes: {post.accurateVotes} accurate / {post.inaccurateVotes} inaccurate
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}