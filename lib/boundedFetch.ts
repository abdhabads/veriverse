// lib/boundedFetch.ts
//
// P5.2: the hardened HTTP client for "verify this URL." Every request this
// module makes is deliberately built on Node's core http/https modules
// rather than the global fetch(), specifically so the TCP connection can be
// pinned to an address this module has ALREADY validated (see
// lib/urlSafety.ts) - closing the classic SSRF-via-DNS-rebinding TOCTOU gap
// where a hostname is validated safe, then re-resolved (potentially to a
// different, private address) by the HTTP client itself at connect time.
// The `lookup` override below makes that second resolution impossible: the
// socket only ever connects to the address this module itself checked.
import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { parseVerifiableUrl, resolveAllSafeAddresses, isBlockedAddress } from "@/lib/urlSafety";

const TOTAL_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_REDIRECTS = 3;
const USER_AGENT = "VeriVerseBot/1.0 (+https://www.veriverse.io; external claim verification)";
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export type BoundedFetchOutcome =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: string };

type SingleHopResult =
  | { kind: "html"; html: string; finalUrl: string }
  | { kind: "redirect"; location: string }
  | { kind: "error"; reason: string };

// Resolves the ip family net.isIP already told us during validation - kept
// here as a tiny parse rather than re-importing net just for this.
function ipFamily(address: string): 4 | 6 {
  return address.includes(":") ? 6 : 4;
}

function performSingleHop(
  url: URL,
  pinnedAddress: string,
  signal: AbortSignal,
  bytesBudget: number
): Promise<SingleHopResult> {
  return new Promise((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const family = ipFamily(pinnedAddress);

    // The `lookup` override is the load-bearing line: whatever DNS would
    // return for url.hostname at connect time is never consulted - the
    // socket connects to exactly the address lib/urlSafety.ts already
    // validated, and nothing else. `servername`/`host` stay the real
    // hostname so TLS SNI and certificate hostname verification (https)
    // and virtual-hosting (`Host` header) still work correctly.
    const req = client.request({
      protocol: url.protocol,
      hostname: url.hostname,
      host: url.hostname,
      servername: url.protocol === "https:" ? url.hostname : undefined,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      signal,
      // Node's net module requests the array form ({all: true}) for its
      // Happy-Eyeballs multi-address connect logic - responding with only
      // the legacy single-address 3-arg form in that case makes net
      // misread the result as a malformed address ("Invalid IP address:
      // undefined"), confirmed empirically. Always hand back exactly the
      // one pre-validated address regardless of which form was requested -
      // there is never a second candidate to race against.
      lookup: (
        _hostname: string,
        options: { all?: boolean } | undefined,
        callback: (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void
      ) => {
        if (options?.all) {
          callback(null, [{ address: pinnedAddress, family }]);
        } else {
          callback(null, pinnedAddress, family);
        }
      },
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        // Never compression - sidesteps decompression-bomb risk entirely
        // rather than needing to bound a second, post-decompression size.
        "Accept-Encoding": "identity",
        Host: url.hostname,
      },
      // Never forwards a user's own cookies/auth/headers - there are none
      // to forward in the first place, since the only input to this whole
      // module is a URL string, never a browser session.
    });

    req.on("error", (error: unknown) => {
      const isAbort = error instanceof Error && error.name === "AbortError";
      resolve({ kind: "error", reason: isAbort ? "timeout" : "fetch_failed" });
    });

    req.on("response", (res: IncomingMessage) => {
      const statusCode = res.statusCode ?? 0;

      if (REDIRECT_STATUS_CODES.has(statusCode)) {
        const location = res.headers.location;
        res.resume(); // discard body, release the socket
        if (!location) {
          resolve({ kind: "error", reason: "invalid_redirect" });
          return;
        }
        resolve({ kind: "redirect", location });
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        resolve({ kind: "error", reason: "upstream_error" });
        return;
      }

      const contentType = res.headers["content-type"] || "";
      if (!contentType.toLowerCase().includes("text/html")) {
        res.resume();
        resolve({ kind: "error", reason: "unsupported_content_type" });
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      res.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > bytesBudget) {
          if (!settled) {
            settled = true;
            resolve({ kind: "error", reason: "response_too_large" });
          }
          res.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({
          kind: "html",
          html: Buffer.concat(chunks).toString("utf-8"),
          finalUrl: url.toString(),
        });
      });

      res.on("error", () => {
        if (settled) return;
        settled = true;
        resolve({ kind: "error", reason: "fetch_failed" });
      });
    });

    req.end();
  });
}

// Validates (scheme/credentials, then DNS/IP safety) and returns the
// pinned address to connect to, or a reason string. Shared by the initial
// URL and every redirect hop - the exact same checks run every time,
// never a looser check "because it's just a redirect."
async function validateHop(rawUrl: string): Promise<
  { ok: true; url: URL; address: string } | { ok: false; reason: string }
> {
  const parsed = parseVerifiableUrl(rawUrl);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const resolved = await resolveAllSafeAddresses(parsed.url.hostname);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  // Pin to the first validated address - every address in the list already
  // passed isBlockedAddress, so any of them is safe to connect to.
  return { ok: true, url: parsed.url, address: resolved.addresses[0] };
}

// KNOWN RESIDUAL RISK (documented, not silently assumed away): the DNS
// resolution above and the TCP connection below both happen inside this
// same function call, milliseconds apart, using the address this function
// itself resolved - there is no second, independent DNS lookup for the
// actual connection (that's the whole point of the `lookup` override in
// performSingleHop). This closes the common "validate hostname, then let
// the HTTP client re-resolve it and connect to whatever DNS answers *this
// time*" TOCTOU gap. What remains unclosed: a sufficiently fast, actively
// malicious authoritative DNS server could theoretically answer safely to
// THIS lookup and would need to, since no second lookup ever happens for
// this specific request - so the classic multi-request rebinding pattern
// (answer safe, then answer private on a later request the client trusts)
// cannot succeed against a single verification call the way it could
// against a client that re-resolves per redirect/retry. The narrower
// residual gap is a DNS response that itself lies within the brief window
// between this module's own `dns.lookup` call and the moment the socket
// connects - not eliminable without OS-level connect-time IP pinning,
// which this stack does not have. Given every redirect hop is
// independently re-validated (never trusting an earlier hop's validation
// for a later address), this is judged a substantial, bounded defense
// with a narrow, explicitly-documented residual gap - not a weak one.
export async function fetchPublicHtml(
  rawUrl: string,
  // Test-only overrides - production call sites never pass these, so
  // TOTAL_TIMEOUT_MS/MAX_RESPONSE_BYTES stay the real, hardened defaults
  // for every real request. Lets tests exercise timeout/size-cap behavior
  // in milliseconds/kilobytes instead of the real 8s/2MB.
  overrides?: { timeoutMs?: number; maxBytes?: number }
): Promise<BoundedFetchOutcome> {
  const timeoutMs = overrides?.timeoutMs ?? TOTAL_TIMEOUT_MS;
  const maxBytes = overrides?.maxBytes ?? MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const validated = await validateHop(currentUrl);
      if (!validated.ok) return { ok: false, reason: validated.reason };

      const result = await performSingleHop(validated.url, validated.address, controller.signal, maxBytes);

      if (result.kind === "html") {
        return { ok: true, html: result.html, finalUrl: result.finalUrl };
      }
      if (result.kind === "error") {
        return { ok: false, reason: result.reason };
      }

      // result.kind === "redirect"
      if (hop === MAX_REDIRECTS) {
        return { ok: false, reason: "too_many_redirects" };
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(result.location, validated.url);
      } catch {
        return { ok: false, reason: "invalid_redirect" };
      }
      currentUrl = nextUrl.toString();
    }

    return { ok: false, reason: "too_many_redirects" };
  } finally {
    clearTimeout(timer);
  }
}

// Exported for tests only - lets the security test matrix exercise
// isBlockedAddress-driven rejection without needing a real socket.
export const __internal = { validateHop };
