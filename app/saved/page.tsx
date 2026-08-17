"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";

export default function SavedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    fetchSaved();
  }, []);

  const fetchSaved = async () => {
    const res = await axios.get("/api/saved", {
      headers: { Authorization: `Bearer ${token}` },
    });

    setPosts(res.data.saved || []);
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
          </div>
        </div>
      </div>

      <div className="vv-container">
        <h2 className="vv-title mb-6">Saved Posts</h2>

        {posts.length === 0 ? (
          <div className="vv-card p-6">
            <p className="vv-subtitle">No saved posts.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((item) => (
              <div key={item._id} className="vv-card p-4">
                <p className="font-semibold text-sm mb-1">{item.post.author.username}</p>
                <p className="text-sm text-slate-700">{item.post.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
