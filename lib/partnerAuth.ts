// lib/partnerAuth.ts
//
// P5.5: authorization for the external Partner API - deliberately NOT
// lib/auth.ts's user-JWT model. A partner is a pre-configured server-to-
// server credential (an API key), not a logged-in VeriVerse user, and must
// never be checked against getUserIdFromRequest/requireActiveUser - a
// partner key is not a valid JWT and would simply fail that check (which
// would be a confusing, wrong error, not a security hole - but the two
// auth models are intentionally kept fully disjoint here).
//
// Keys are configured entirely server-side via the PARTNER_API_KEYS env
// var (see docs/PARTNER_API.md) - no database model, no admin CRUD UI, in
// keeping with P5.5's "smallest safe initial approach" scope. Format is a
// comma-separated list of "<partnerId>:<key>:<capability>" triples, e.g.
// "acme:sk_live_abc123:lookup_only,example:sk_live_def456:verify".
// Malformed entries are skipped defensively; a misconfigured credential
// list degrades to "that one entry doesn't authenticate," never a crash.
//
// The key is only ever read from the Authorization header - never a query
// param, URL path segment, or request body, so it can't end up in server
// access logs or browser history the way a query-string key could.
import { timingSafeEqual } from "node:crypto";

export type PartnerCapability = "lookup_only" | "verify";

export type PartnerIdentity = {
  partnerId: string;
  capability: PartnerCapability;
};

type PartnerCredential = PartnerIdentity & { key: string };

function parsePartnerCredentials(raw: string | undefined): PartnerCredential[] {
  if (!raw) return [];

  const credentials: PartnerCredential[] = [];
  for (const entry of raw.split(",")) {
    const parts = entry.split(":").map((part) => part.trim());
    if (parts.length !== 3) continue;

    const [partnerId, key, capability] = parts;
    if (!partnerId || !key) continue;
    if (capability !== "lookup_only" && capability !== "verify") continue;

    credentials.push({ partnerId, key, capability });
  }
  return credentials;
}

// Constant-time comparison, and deliberately never short-circuits the
// surrounding loop on an early match - every configured credential is
// compared against the presented key on every call, so response timing
// cannot reveal how many characters matched or which position in the
// configured list a correct key lives at.
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // A same-cost comparison against itself, so a length mismatch alone
    // doesn't take a measurably different code path than a same-length
    // mismatch would.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Returns null for every failure shape alike (no header, wrong scheme,
// unknown key) - callers respond with a single generic 401 regardless of
// which one occurred, so a caller probing for valid key formats learns
// nothing from the response.
export function getPartnerIdentity(req: Request): PartnerIdentity | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const presentedKey = authHeader.slice("Bearer ".length).trim();
  if (!presentedKey) return null;

  const credentials = parsePartnerCredentials(process.env.PARTNER_API_KEYS);

  let matched: PartnerIdentity | null = null;
  for (const credential of credentials) {
    if (safeEquals(presentedKey, credential.key)) {
      matched = { partnerId: credential.partnerId, capability: credential.capability };
    }
  }
  return matched;
}
