import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

describe("rate limit", () => {
  it("allows within limit", () => {
    const key = `test-key-${Date.now()}`;
    const first = checkRateLimit(key, { windowMs: 1000, max: 2 });
    const second = checkRateLimit(key, { windowMs: 1000, max: 2 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });

  it("blocks above limit", () => {
    const key = `test-key-limit-${Date.now()}`;
    checkRateLimit(key, { windowMs: 1000, max: 1 });
    const second = checkRateLimit(key, { windowMs: 1000, max: 1 });

    expect(second.allowed).toBe(false);
  });
});
