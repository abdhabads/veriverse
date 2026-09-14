// tests/unit/boundedFetch.test.ts
//
// P5.2: exercises the real HTTP mechanics (redirects, size cap, timeout,
// content-type gate) against a real local HTTP server, while the SSRF
// validation step (already exhaustively, separately tested for real in
// urlSafety.test.ts) is mocked ONLY for the fake "public.example.test"
// hostname these tests use to reach that local server - every other
// hostname (in particular any literal private-IP redirect target) still
// goes through the REAL, unmocked lib/urlSafety.ts, so the
// "redirect to a private address is rejected" test below is a genuine,
// not merely simulated, proof of that defense.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

const FAKE_PUBLIC_HOSTNAME = "public.example.test";
let serverAddress: string;
let port: number;
let server: http.Server;

vi.mock("@/lib/urlSafety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/urlSafety")>();
  return {
    ...actual,
    resolveAllSafeAddresses: vi.fn(async (hostname: string) => {
      if (hostname === FAKE_PUBLIC_HOSTNAME) {
        return { ok: true, addresses: [serverAddress] };
      }
      // Every other hostname (including any literal IP a redirect points
      // at) goes through the real, unmocked check.
      return actual.resolveAllSafeAddresses(hostname);
    }),
  };
});

function url(path: string): string {
  return `http://${FAKE_PUBLIC_HOSTNAME}:${port}${path}`;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = req.url || "/";

    if (path === "/ok") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><head><title>Example Article</title></head><body><article><p>The sky is blue.</p></article></body></html>");
      return;
    }
    if (path === "/redirect-once") {
      res.writeHead(302, { Location: "/ok" });
      res.end();
      return;
    }
    if (path === "/redirect-to-private") {
      res.writeHead(302, { Location: "http://127.0.0.1:9/ok" });
      res.end();
      return;
    }
    if (path === "/redirect-loop") {
      res.writeHead(302, { Location: "/redirect-loop" });
      res.end();
      return;
    }
    if (path === "/redirect-missing-location") {
      res.writeHead(302);
      res.end();
      return;
    }
    if (path === "/huge") {
      res.writeHead(200, { "Content-Type": "text/html" });
      const chunk = Buffer.alloc(64 * 1024, "a");
      let sent = 0;
      const interval = setInterval(() => {
        if (sent > 3 * 1024 * 1024) {
          clearInterval(interval);
          res.end();
          return;
        }
        sent += chunk.length;
        res.write(chunk);
      }, 1);
      return;
    }
    if (path === "/unsupported-type") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"not":"html"}');
      return;
    }
    if (path === "/slow") {
      // Never responds within the test's short override timeout.
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  serverAddress = address.address;
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchPublicHtml - successful extraction", () => {
  it("fetches and returns HTML for a safe, direct URL", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/ok"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("Example Article");
      expect(result.finalUrl).toBe(url("/ok"));
    }
  });
});

describe("fetchPublicHtml - redirects", () => {
  it("follows a single redirect to a safe destination", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/redirect-once"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toContain("Example Article");
  });

  it("rejects a redirect whose target resolves to a private/blocked address", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/redirect-to-private"));
    expect(result).toEqual({ ok: false, reason: "resolves_to_disallowed_address" });
  });

  it("rejects a redirect loop as too many redirects", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/redirect-loop"));
    expect(result).toEqual({ ok: false, reason: "too_many_redirects" });
  });

  it("rejects a redirect response with no Location header", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/redirect-missing-location"));
    expect(result).toEqual({ ok: false, reason: "invalid_redirect" });
  });
});

describe("fetchPublicHtml - bounded response size", () => {
  it("aborts and rejects a response exceeding the byte cap", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/huge"), { maxBytes: 512 * 1024 });
    expect(result).toEqual({ ok: false, reason: "response_too_large" });
  });
});

describe("fetchPublicHtml - content-type gate", () => {
  it("rejects a non-HTML content type", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/unsupported-type"));
    expect(result).toEqual({ ok: false, reason: "unsupported_content_type" });
  });
});

describe("fetchPublicHtml - timeout", () => {
  it("aborts a request that never responds within the timeout budget", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(url("/slow"), { timeoutMs: 300 });
    expect(result).toEqual({ ok: false, reason: "timeout" });
  });
});

describe("fetchPublicHtml - malformed/unsafe URL rejected before any connection", () => {
  it("rejects a non-http(s) scheme without touching the network", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml("file:///etc/passwd");
    expect(result).toEqual({ ok: false, reason: "unsupported_scheme" });
  });

  it("rejects a URL pointed directly at a loopback address", async () => {
    const { fetchPublicHtml } = await import("@/lib/boundedFetch");
    const result = await fetchPublicHtml(`http://127.0.0.1:${port}/ok`);
    expect(result).toEqual({ ok: false, reason: "resolves_to_disallowed_address" });
  });
});
