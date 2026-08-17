import { describe, it, expect, vi } from "vitest";
import { withRetry, withTimeout } from "@/lib/withRetry";

describe("withTimeout", () => {
  it("resolves if promise completes within timeout", async () => {
    const result = await withTimeout(
      Promise.resolve("ok"),
      1_000,
      "test"
    );
    expect(result).toBe("ok");
  });

  it("rejects if promise exceeds timeout", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(slow, 50, "slow op")).rejects.toThrow(
      "slow op timed out after 50ms"
    );
  });

  it("rejects with original error if promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("network error"));
    await expect(withTimeout(failing, 1_000, "test")).rejects.toThrow(
      "network error"
    );
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      label: "test",
    });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      label: "test",
    });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, label: "test" })
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("calls exactly maxAttempts times on total failure", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    try {
      await withRetry(fn, { maxAttempts: 4, baseDelayMs: 10, label: "test" });
    } catch {
      // expected
    }
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("succeeds on last attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce("last chance");

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      label: "test",
    });
    expect(result).toBe("last chance");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
