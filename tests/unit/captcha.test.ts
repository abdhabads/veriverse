import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { verifyCaptchaToken } from "@/lib/captcha";

function mockFetchOnce(response: { ok?: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: response.json,
    })
  );
}

describe("verifyCaptchaToken", () => {
  const originalEnabled = process.env.CAPTCHA_ENABLED;
  const originalSecret = process.env.CAPTCHA_SECRET_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnabled === undefined) delete process.env.CAPTCHA_ENABLED;
    else process.env.CAPTCHA_ENABLED = originalEnabled;
    if (originalSecret === undefined) delete process.env.CAPTCHA_SECRET_KEY;
    else process.env.CAPTCHA_SECRET_KEY = originalSecret;
  });

  it("1. succeeds without a token when CAPTCHA is disabled", async () => {
    process.env.CAPTCHA_ENABLED = "false";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyCaptchaToken(undefined);

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("2. fails when enabled and the token is missing", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyCaptchaToken("");

    expect(result.success).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("3. fails closed when enabled but CAPTCHA_SECRET_KEY is missing", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    delete process.env.CAPTCHA_SECRET_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyCaptchaToken("some-real-looking-token");

    expect(result.success).toBe(false);
    // Must fail closed WITHOUT ever attempting to call Cloudflare with a
    // missing secret.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("4. succeeds on a valid Siteverify response", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    mockFetchOnce({ json: async () => ({ success: true }) });

    const result = await verifyCaptchaToken("a-real-token");

    expect(result.success).toBe(true);
  });

  it("5. fails on an invalid (success: false) Siteverify response", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    mockFetchOnce({
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });

    const result = await verifyCaptchaToken("a-bad-token");

    expect(result.success).toBe(false);
  });

  it("6. fails closed on a Cloudflare network failure", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unreachable"))
    );

    const result = await verifyCaptchaToken("a-token");

    expect(result.success).toBe(false);
  });

  it("7. fails closed on a malformed Siteverify response (non-JSON body)", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    mockFetchOnce({
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });

    const result = await verifyCaptchaToken("a-token");

    expect(result.success).toBe(false);
  });

  it("7b. fails closed on a malformed Siteverify response (missing success field)", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    mockFetchOnce({ json: async () => ({ foo: "bar" }) });

    const result = await verifyCaptchaToken("a-token");

    expect(result.success).toBe(false);
  });

  it("8. the old placeholder string 'human-verified' has no privileged meaning", async () => {
    process.env.CAPTCHA_ENABLED = "true";
    process.env.CAPTCHA_SECRET_KEY = "test-secret";
    // Cloudflare would reject a string that isn't a real token - simulate
    // exactly that, and confirm the function does not special-case it.
    mockFetchOnce({
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });

    const result = await verifyCaptchaToken("human-verified");

    expect(result.success).toBe(false);
  });
});
