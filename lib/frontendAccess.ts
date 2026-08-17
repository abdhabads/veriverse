import { api } from "@/lib/apiClient";

export async function requireAuthenticated(router: { push: (path: string) => void }) {
  try {
    const res = await api.get("/access");
    return res.data.user;
  } catch {
    router.push("/login");
    return null;
  }
}

export async function requireAdmin(router: { push: (path: string) => void }) {
  try {
    const res = await api.get("/access");
    const user = res.data.user;

    if (user.role !== "admin") {
      router.push("/feed");
      return null;
    }

    return user;
  } catch {
    router.push("/login");
    return null;
  }
}

export async function requireExpert(router: { push: (path: string) => void }) {
  try {
    const res = await api.get("/access");
    const user = res.data.user;

    if (!["expert", "admin"].includes(user.role)) {
      router.push("/feed");
      return null;
    }

    return user;
  } catch {
    router.push("/login");
    return null;
  }
}
