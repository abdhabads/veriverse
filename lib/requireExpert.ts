import { api } from "@/lib/apiClient";

export async function requireExpert(router: { push: (path: string) => void }) {
  try {
    const access = await api.get("/access");
    const user = access.data.user;

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
