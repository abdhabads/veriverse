import { api } from "@/lib/apiClient";

export async function fetchMyProfile() {
  try {
    const res = await api.get("/profile");
    return res.data;
  } catch {
    const [{ data: accessData }, { data: postsData }] = await Promise.all([
      api.get("/access"),
      api.get("/posts"),
    ]);

    const currentUser = accessData?.user || null;
    const currentUserId = String(currentUser?._id || currentUser?.id || "");
    const allPosts = Array.isArray(postsData?.posts) ? postsData.posts : [];
    const userPosts = allPosts.filter((post: any) => {
      const author = post?.author;
      const authorId = typeof author === "string"
        ? author
        : String(author?._id || author?.id || "");

      return authorId === currentUserId;
    });

    return {
      success: true,
      user: currentUser,
      posts: userPosts,
    };
  }
}

export async function updateMyProfile(payload: {
  username?: string;
  bio?: string;
  avatarUrl?: string;
}) {
  const res = await api.patch("/profile", payload);
  return res.data;
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
}) {
  const res = await api.patch("/profile/password", payload);
  return res.data;
}

export async function deactivateMyAccount(password: string) {
  const res = await api.patch("/profile/account", {
    action: "deactivate",
    password,
  });
  return res.data;
}

export async function deleteMyAccount(password: string) {
  const res = await api.delete("/profile/account", {
    data: { password },
  });
  return res.data;
}

export async function fetchMyReputationLogs() {
  const res = await api.get("/reputation");
  return res.data;
}

export async function fetchMyRewardLogs() {
  const res = await api.get("/rewards");
  return res.data;
}

export async function fetchMyAppeals() {
  const res = await api.get("/appeals/me");
  return res.data;
}

export async function fetchMySafetyRelations() {
  const res = await api.get("/relations/list");
  return res.data;
}

export async function toggleSafetyRelation(payload: {
  targetUserId: string;
  relationType: "block" | "mute";
}) {
  const res = await api.post("/relations", payload);
  return res.data;
}
