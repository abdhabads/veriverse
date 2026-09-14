// tests/unit/partnerAuth.test.ts
//
// P5.5: pure unit tests for lib/partnerAuth.ts - no DB, no network. Proves
// the parsing/comparison logic itself, independent of the route that uses
// it (tests/unit/partnerVerifyApi.test.ts covers the route-level behavior).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPartnerIdentity } from "@/lib/partnerAuth";

let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.PARTNER_API_KEYS;
});

afterEach(() => {
  process.env.PARTNER_API_KEYS = originalEnv;
});

function req(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("http://localhost/api/v1/verify", { headers });
}

describe("getPartnerIdentity", () => {
  it("returns null when PARTNER_API_KEYS is unset", () => {
    delete process.env.PARTNER_API_KEYS;
    expect(getPartnerIdentity(req("Bearer anything"))).toBeNull();
  });

  it("returns null with no Authorization header at all", () => {
    process.env.PARTNER_API_KEYS = "acme:secret123:lookup_only";
    expect(getPartnerIdentity(req())).toBeNull();
  });

  it("returns null for a non-Bearer scheme", () => {
    process.env.PARTNER_API_KEYS = "acme:secret123:lookup_only";
    expect(getPartnerIdentity(req("Basic secret123"))).toBeNull();
  });

  it("returns null for an empty Bearer token", () => {
    process.env.PARTNER_API_KEYS = "acme:secret123:lookup_only";
    expect(getPartnerIdentity(req("Bearer "))).toBeNull();
  });

  it("returns null for a key that doesn't match any configured credential", () => {
    process.env.PARTNER_API_KEYS = "acme:secret123:lookup_only";
    expect(getPartnerIdentity(req("Bearer wrong-secret"))).toBeNull();
  });

  it("resolves a matching key to its partnerId and capability", () => {
    process.env.PARTNER_API_KEYS = "acme:secret123:lookup_only";
    const identity = getPartnerIdentity(req("Bearer secret123"));
    expect(identity).toEqual({ partnerId: "acme", capability: "lookup_only" });
  });

  it("supports multiple configured partners and matches the right one", () => {
    process.env.PARTNER_API_KEYS = "acme:keyA:lookup_only,widgetco:keyB:verify";
    expect(getPartnerIdentity(req("Bearer keyA"))).toEqual({ partnerId: "acme", capability: "lookup_only" });
    expect(getPartnerIdentity(req("Bearer keyB"))).toEqual({ partnerId: "widgetco", capability: "verify" });
  });

  it("skips a malformed entry (wrong number of segments) rather than throwing", () => {
    process.env.PARTNER_API_KEYS = "malformed-entry-no-colons,acme:keyA:lookup_only";
    expect(() => getPartnerIdentity(req("Bearer keyA"))).not.toThrow();
    expect(getPartnerIdentity(req("Bearer keyA"))).toEqual({ partnerId: "acme", capability: "lookup_only" });
  });

  it("skips an entry with an unrecognized capability value", () => {
    process.env.PARTNER_API_KEYS = "acme:keyA:admin,widgetco:keyB:verify";
    expect(getPartnerIdentity(req("Bearer keyA"))).toBeNull();
    expect(getPartnerIdentity(req("Bearer keyB"))).toEqual({ partnerId: "widgetco", capability: "verify" });
  });

  it("never matches a key that is merely a prefix or suffix of a configured key", () => {
    process.env.PARTNER_API_KEYS = "acme:secret123456:lookup_only";
    expect(getPartnerIdentity(req("Bearer secret123"))).toBeNull();
    expect(getPartnerIdentity(req("Bearer secret123456extra"))).toBeNull();
  });

  it("is case-sensitive on the key itself", () => {
    process.env.PARTNER_API_KEYS = "acme:CaseSensitiveKey:lookup_only";
    expect(getPartnerIdentity(req("Bearer casesensitivekey"))).toBeNull();
    expect(getPartnerIdentity(req("Bearer CaseSensitiveKey"))).toEqual({
      partnerId: "acme",
      capability: "lookup_only",
    });
  });
});
