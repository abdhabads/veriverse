import { api } from "@/lib/apiClient";

export async function requireAdmin(router: { push: (path: string) => void }) {
  try {
    const access = await api.get("/access");
    const user = access.data.user;

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
