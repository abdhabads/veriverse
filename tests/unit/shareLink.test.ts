import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPostShareUrl, sharePost } from "@/lib/shareLink";

const ORIGIN = "https://www.veriverse.io";

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: ORIGIN } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildPostShareUrl", () => {
  it("builds the canonical post URL from window.location.origin, not a config constant", () => {
    expect(buildPostShareUrl("abc123")).toBe(`${ORIGIN}/posts/abc123`);
  });
});

describe("sharePost", () => {
  it("passes the canonical URL, title, and text to navigator.share when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: shareMock });

    const result = await sharePost({ postId: "post1", title: "VeriVerse post", text: "Take a look." });

    expect(shareMock).toHaveBeenCalledWith({
      title: "VeriVerse post",
      text: "Take a look.",
      url: `${ORIGIN}/posts/post1`,
    });
    expect(result.status).toBe("shared");
  });

  it("falls back to clipboard with the canonical URL when navigator.share is unavailable", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: writeTextMock } });

    const result = await sharePost({ postId: "post2", title: "t", text: "x" });

    expect(writeTextMock).toHaveBeenCalledWith(`${ORIGIN}/posts/post2`);
    expect(result).toEqual({ status: "copied", message: "Link copied" });
  });

  it("treats an AbortError from navigator.share as cancellation, without falling back to clipboard", async () => {
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const shareMock = vi.fn().mockRejectedValue(abortError);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: shareMock, clipboard: { writeText: writeTextMock } });

    const result = await sharePost({ postId: "post3", title: "t", text: "x" });

    expect(result.status).toBe("cancelled");
    expect(writeTextMock).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when navigator.share fails for a non-cancellation reason", async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error("some other native failure"));
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: shareMock, clipboard: { writeText: writeTextMock } });

    const result = await sharePost({ postId: "post4", title: "t", text: "x" });

    expect(writeTextMock).toHaveBeenCalledWith(`${ORIGIN}/posts/post4`);
    expect(result).toEqual({ status: "copied", message: "Link copied" });
  });

  it("reports an error status when clipboard also fails", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText: writeTextMock } });

    const result = await sharePost({ postId: "post5", title: "t", text: "x" });

    expect(result.status).toBe("error");
  });
});
