// tests/unit/urlSafety.test.ts
//
// P5.2: the security-critical test matrix for the SSRF defense layer.
// Pure logic only - no real network access, no real DNS. Hostile-address
// cases mock dns.promises.lookup rather than probing real private/internal
// addresses.
import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns";
import {
  parseVerifiableUrl,
  isBlockedAddress,
  resolveAllSafeAddresses,
} from "@/lib/urlSafety";

describe("parseVerifiableUrl - scheme and shape", () => {
  it("accepts a valid public https URL", () => {
    const result = parseVerifiableUrl("https://example.com/article");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.hostname).toBe("example.com");
  });

  it("accepts a valid public http URL", () => {
    const result = parseVerifiableUrl("http://example.com/article");
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed URL", () => {
    const result = parseVerifiableUrl("not a url at all");
    expect(result).toEqual({ ok: false, reason: "malformed_url" });
  });

  it("rejects non-http(s) schemes", () => {
    for (const scheme of ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "data:text/html,x"]) {
      const result = parseVerifiableUrl(scheme);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a URL containing embedded credentials", () => {
    const result = parseVerifiableUrl("https://user:pass@example.com/");
    expect(result).toEqual({ ok: false, reason: "url_contains_credentials" });
  });
});

describe("isBlockedAddress - IPv4", () => {
  it("blocks localhost/loopback", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("127.255.255.255")).toBe(true);
  });

  it("blocks 0.0.0.0", () => {
    expect(isBlockedAddress("0.0.0.0")).toBe(true);
  });

  it("blocks every RFC1918 private range", () => {
    expect(isBlockedAddress("10.0.0.1")).toBe(true);
    expect(isBlockedAddress("172.16.0.1")).toBe(true);
    expect(isBlockedAddress("172.31.255.255")).toBe(true);
    expect(isBlockedAddress("192.168.1.1")).toBe(true);
  });

  it("blocks link-local, including the cloud metadata endpoint", () => {
    expect(isBlockedAddress("169.254.1.1")).toBe(true);
    expect(isBlockedAddress("169.254.169.254")).toBe(true);
  });

  it("blocks carrier-grade NAT and reserved/multicast ranges", () => {
    expect(isBlockedAddress("100.64.0.1")).toBe(true);
    expect(isBlockedAddress("224.0.0.1")).toBe(true);
    expect(isBlockedAddress("255.255.255.255")).toBe(true);
  });

  it("allows an ordinary public IPv4 address", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false); // example.com's historical public IP
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
});

describe("isBlockedAddress - IPv6", () => {
  it("blocks the IPv6 loopback", () => {
    expect(isBlockedAddress("::1")).toBe(true);
  });

  it("blocks unique-local (fc00::/7)", () => {
    expect(isBlockedAddress("fd00::1")).toBe(true);
    expect(isBlockedAddress("fc00::1")).toBe(true);
  });

  it("blocks link-local (fe80::/10)", () => {
    expect(isBlockedAddress("fe80::1")).toBe(true);
  });

  it("blocks the unspecified address", () => {
    expect(isBlockedAddress("::")).toBe(true);
  });

  it("blocks an IPv4-mapped IPv6 address whose embedded IPv4 is private", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("blocks a NAT64-mapped address whose embedded IPv4 is private", () => {
    expect(isBlockedAddress("64:ff9b::127.0.0.1")).toBe(true);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false); // Cloudflare public DNS
  });

  it("allows an IPv4-mapped IPv6 address whose embedded IPv4 is public", () => {
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isBlockedAddress - malformed/unparseable input fails closed", () => {
  it("treats a non-IP string as blocked rather than throwing", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});

describe("resolveAllSafeAddresses - DNS-mocked", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when the only resolved address is private", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as any);

    const result = await resolveAllSafeAddresses("evil.example");
    expect(result).toEqual({ ok: false, reason: "resolves_to_disallowed_address" });
  });

  it("rejects when DNS resolution fails entirely", async () => {
    vi.spyOn(dns.promises, "lookup").mockRejectedValue(new Error("ENOTFOUND"));

    const result = await resolveAllSafeAddresses("does-not-exist.example");
    expect(result).toEqual({ ok: false, reason: "dns_resolution_failed" });
  });

  it("rejects a mixed DNS answer where only one of several addresses is private", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 }, // the one bad apple
    ] as any);

    const result = await resolveAllSafeAddresses("mixed.example");
    expect(result).toEqual({ ok: false, reason: "resolves_to_disallowed_address" });
  });

  it("accepts a hostname whose every resolved address is public", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ] as any);

    const result = await resolveAllSafeAddresses("safe.example");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.addresses).toHaveLength(2);
  });
});
