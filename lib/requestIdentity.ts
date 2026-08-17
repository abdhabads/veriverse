export function getClientIp(req: Request): string {
  const forwardedFor =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

export function getRateLimitKey(req: Request, action: string, userId?: string | null) {
  const ip = getClientIp(req);
  return userId ? `${action}:user:${userId}` : `${action}:ip:${ip}`;
}
