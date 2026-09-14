// lib/urlSafety.ts
//
// P5.2: the SSRF defense layer for "verify this URL". Pure, network-free
// logic (IP range classification, URL scheme/credential validation) lives
// here; the actual DNS resolution and fetch live in lib/boundedFetch.ts,
// which calls into this module before ever opening a socket.
//
// Threat model: the submitted URL is hostile. A URL string alone proves
// nothing about where it will actually connect - only resolving it (and
// re-resolving every redirect target) and checking every returned address
// against the ranges below is a real defense. Hostname-string filtering
// alone (blocking "localhost" as text) is explicitly NOT sufficient and is
// not what this module does.
import dns from "node:dns";
import net from "node:net";

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Native URL parser only - never a hand-rolled regex. Rejects embedded
// credentials (userinfo, e.g. "https://user:pass@host/") since those are
// meaningless for a public page fetch and are a classic SSRF/credential-
// leak smuggling vector.
export function parseVerifiableUrl(rawUrl: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed_url" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: "unsupported_scheme" };
  }

  if (url.username || url.password) {
    return { ok: false, reason: "url_contains_credentials" };
  }

  return { ok: true, url };
}

// --- IPv4 range classification ---

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function ipv4InCidr(ipInt: number, base: string, prefixLen: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  if (prefixLen === 0) return true;
  const mask = prefixLen === 32 ? 0xffffffff : (0xffffffff << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// Every range here is a documented reserved/private/special-use IPv4 block
// (IANA special-purpose address registry) - not just the "obvious" private
// ranges. Includes the cloud-metadata endpoint (169.254.169.254) via the
// link-local block that contains it, rather than as a special case.
const BLOCKED_IPV4_CIDRS: Array<{ base: string; prefixLen: number; label: string }> = [
  { base: "0.0.0.0", prefixLen: 8, label: "this-network" },
  { base: "10.0.0.0", prefixLen: 8, label: "rfc1918" },
  { base: "100.64.0.0", prefixLen: 10, label: "carrier-grade-nat" },
  { base: "127.0.0.0", prefixLen: 8, label: "loopback" },
  { base: "169.254.0.0", prefixLen: 16, label: "link-local" }, // includes 169.254.169.254 cloud metadata
  { base: "172.16.0.0", prefixLen: 12, label: "rfc1918" },
  { base: "192.0.0.0", prefixLen: 24, label: "ietf-protocol-assignments" },
  { base: "192.0.2.0", prefixLen: 24, label: "documentation" },
  { base: "192.88.99.0", prefixLen: 24, label: "6to4-relay-anycast" },
  { base: "192.168.0.0", prefixLen: 16, label: "rfc1918" },
  { base: "198.18.0.0", prefixLen: 15, label: "benchmarking" },
  { base: "198.51.100.0", prefixLen: 24, label: "documentation" },
  { base: "203.0.113.0", prefixLen: 24, label: "documentation" },
  { base: "224.0.0.0", prefixLen: 4, label: "multicast" },
  { base: "240.0.0.0", prefixLen: 4, label: "reserved" }, // includes 255.255.255.255
];

function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true; // unparseable - fail closed
  return BLOCKED_IPV4_CIDRS.some((range) => ipv4InCidr(ipInt, range.base, range.prefixLen));
}

// --- IPv6 range classification ---

// Expands any valid IPv6 text form (compressed "::", mixed IPv4-tail, etc.)
// into 8 16-bit groups as a bigint - deliberately using net.isIPv6 to
// validate shape first rather than trusting a hand-rolled parser to reject
// malformed input safely.
function ipv6ToBigInt(ip: string): bigint | null {
  if (net.isIPv6(ip) !== true) return null;

  let head = ip;
  let tail = "";
  if (ip.includes("::")) {
    const parts = ip.split("::");
    head = parts[0];
    tail = parts[1] ?? "";
  }

  function expandGroups(section: string): string[] {
    if (!section) return [];
    // A trailing embedded IPv4 (e.g. "::ffff:192.168.1.1") - convert to two
    // hex groups so every group is uniformly 16 bits.
    if (section.includes(".")) {
      const groups = section.split(":");
      const v4 = groups.pop()!;
      const v4Int = ipv4ToInt(v4);
      if (v4Int === null) return [];
      groups.push(((v4Int >>> 16) & 0xffff).toString(16));
      groups.push((v4Int & 0xffff).toString(16));
      return groups;
    }
    return section.split(":");
  }

  const headGroups = expandGroups(head);
  const tailGroups = expandGroups(tail);
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;
  const allGroups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  if (allGroups.length !== 8) return null;

  const SIXTEEN = BigInt(16);
  let result = BigInt(0);
  for (const group of allGroups) {
    const n = parseInt(group || "0", 16);
    if (Number.isNaN(n) || n < 0 || n > 0xffff) return null;
    result = (result << SIXTEEN) | BigInt(n);
  }
  return result;
}

// Target is ES2017 (tsconfig.json) - BigInt literal syntax (`0n`) is
// unavailable there, so every constant below is built via BigInt(...)/
// hexToBigInt(...) calls instead, never the `n` suffix.
function hexToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

function ipv6InCidr(ipBig: bigint, base: bigint, prefixLen: number): boolean {
  if (prefixLen === 0) return true;
  const ONE = BigInt(1);
  const mask =
    prefixLen === 128
      ? (ONE << BigInt(128)) - ONE
      : ((ONE << BigInt(prefixLen)) - ONE) << BigInt(128 - prefixLen);
  return (ipBig & mask) === (base & mask);
}

const BLOCKED_IPV6_RANGES: Array<{ base: bigint; prefixLen: number; label: string }> = [
  { base: BigInt(0), prefixLen: 128, label: "unspecified" }, // ::
  { base: BigInt(1), prefixLen: 128, label: "loopback" }, // ::1
  { base: hexToBigInt("fc000000000000000000000000000000"), prefixLen: 7, label: "unique-local" }, // fc00::/7
  { base: hexToBigInt("fe800000000000000000000000000000"), prefixLen: 10, label: "link-local" }, // fe80::/10
  { base: hexToBigInt("ff000000000000000000000000000000"), prefixLen: 8, label: "multicast" }, // ff00::/8
  { base: hexToBigInt("20010db800000000000000000000000"), prefixLen: 32, label: "documentation" }, // 2001:db8::/32
];

// IPv4-mapped (::ffff:a.b.c.d) and NAT64 well-known prefix (64:ff9b::a.b.c.d)
// both embed a real IPv4 address in the low 32 bits - unwrapping and
// re-checking it against the IPv4 blocklist closes an otherwise trivial
// bypass ("connect via the IPv6-mapped form of 127.0.0.1").
const IPV4_MAPPED_PREFIX = hexToBigInt("ffff"); // ::ffff:0:0/96 marker (bits 32-47)
const NAT64_WELL_KNOWN_PREFIX = hexToBigInt("64ff9b000000000000000000000000"); // 64:ff9b::/96

function extractEmbeddedIpv4(ipBig: bigint): string | null {
  const low32 = ipBig & hexToBigInt("ffffffff");
  const isMapped = ipBig >> BigInt(32) === IPV4_MAPPED_PREFIX && ipBig >> BigInt(48) === BigInt(0);
  const isNat64 = ipv6InCidr(ipBig, NAT64_WELL_KNOWN_PREFIX, 96);
  if (!isMapped && !isNat64) return null;

  const n = Number(low32);
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join(".");
}

function isBlockedIpv6(ip: string): boolean {
  const ipBig = ipv6ToBigInt(ip);
  if (ipBig === null) return true; // unparseable - fail closed

  if (BLOCKED_IPV6_RANGES.some((range) => ipv6InCidr(ipBig, range.base, range.prefixLen))) {
    return true;
  }

  const embeddedV4 = extractEmbeddedIpv4(ipBig);
  if (embeddedV4 && isBlockedIpv4(embeddedV4)) {
    return true;
  }

  return false;
}

// Single entry point used by both the pre-fetch DNS check and every
// redirect-hop re-check - one classification function, never two
// independently-maintained copies.
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP at all - fail closed
}

export type ResolveResult =
  | { ok: true; addresses: string[] }
  | { ok: false; reason: string };

// Resolves ALL A/AAAA records for a hostname (not just the first) and
// rejects if ANY of them falls in a blocked range - a hostname that
// answers with one public and one private address must never be treated
// as safe merely because some address looked fine. A hostname that is
// itself a literal IP is handled the same way (dns.lookup accepts one).
export async function resolveAllSafeAddresses(hostname: string): Promise<ResolveResult> {
  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "dns_resolution_failed" };
  }

  if (records.length === 0) {
    return { ok: false, reason: "dns_resolution_failed" };
  }

  const addresses = records.map((r) => r.address);
  const blocked = addresses.find((address) => isBlockedAddress(address));
  if (blocked) {
    return { ok: false, reason: "resolves_to_disallowed_address" };
  }

  return { ok: true, addresses };
}
