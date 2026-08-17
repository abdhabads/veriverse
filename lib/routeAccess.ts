import axios from "axios";

export async function requireAccess(
  router: { push: (path: string) => void },
  allowedRoles?: string[]
) {
  try {
    const res = await axios.get("/api/access");
    const user = res.data.user;

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.push("/feed");
      return null;
    }

    return user;
  } catch {
    router.push("/login");
    return null;
  }
}
