// tests/unit/shareToVeriVerseLink.test.ts
import { describe, it, expect } from "vitest";
import {
  buildShareToVeriVerseUrl,
  MAX_SHARE_TEXT_LENGTH,
  MAX_SHARE_URL_LENGTH,
  MAX_SHARE_TITLE_LENGTH,
} from "@/lib/shareToVeriVerseLink";

describe("buildShareToVeriVerseUrl - basic construction", () => {
  it("builds a text-only deep link", () => {
    const link = buildShareToVeriVerseUrl({ text: "The sky is blue." });
    expect(link).toBe("https://www.veriverse.io/verify?text=The+sky+is+blue.");
  });

  it("builds a url-only deep link", () => {
    const link = buildShareToVeriVerseUrl({ url: "https://example.com/article" });
    expect(link).toBe("https://www.veriverse.io/verify?url=https%3A%2F%2Fexample.com%2Farticle");
  });

  it("builds a deep link with both text and url preserved", () => {
    const link = buildShareToVeriVerseUrl({ text: "A claim", url: "https://example.com/" });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("text")).toBe("A claim");
    expect(parsed.searchParams.get("url")).toBe("https://example.com/");
  });

  it("includes an optional title as separate, distinct context", () => {
    const link = buildShareToVeriVerseUrl({ url: "https://example.com/", title: "Example Domain" });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("title")).toBe("Example Domain");
    expect(parsed.searchParams.get("text")).toBeNull();
  });

  it("returns a bare /verify link when nothing is provided", () => {
    expect(buildShareToVeriVerseUrl({})).toBe("https://www.veriverse.io/verify");
  });
});

describe("buildShareToVeriVerseUrl - never concatenates url into text", () => {
  it("keeps text and url as fully separate parameters even when both are present", () => {
    const link = buildShareToVeriVerseUrl({ text: "Check this", url: "https://example.com/page" });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("text")).toBe("Check this");
    expect(parsed.searchParams.get("text")).not.toContain("example.com");
    expect(parsed.searchParams.get("url")).toBe("https://example.com/page");
  });
});

describe("buildShareToVeriVerseUrl - bounded lengths", () => {
  it("truncates text at MAX_SHARE_TEXT_LENGTH", () => {
    const longText = "a".repeat(MAX_SHARE_TEXT_LENGTH + 500);
    const link = buildShareToVeriVerseUrl({ text: longText });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("text")!.length).toBe(MAX_SHARE_TEXT_LENGTH);
  });

  it("truncates url at MAX_SHARE_URL_LENGTH", () => {
    const longUrl = `https://example.com/${"a".repeat(MAX_SHARE_URL_LENGTH)}`;
    const link = buildShareToVeriVerseUrl({ url: longUrl });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("url")!.length).toBe(MAX_SHARE_URL_LENGTH);
  });

  it("truncates title at MAX_SHARE_TITLE_LENGTH", () => {
    const longTitle = "b".repeat(MAX_SHARE_TITLE_LENGTH + 50);
    const link = buildShareToVeriVerseUrl({ url: "https://example.com/", title: longTitle });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("title")!.length).toBe(MAX_SHARE_TITLE_LENGTH);
  });
});

describe("buildShareToVeriVerseUrl - whitespace and empty input", () => {
  it("omits a whitespace-only text field entirely", () => {
    const link = buildShareToVeriVerseUrl({ text: "   \n\t  " });
    expect(new URL(link).searchParams.has("text")).toBe(false);
  });

  it("trims surrounding whitespace from real values", () => {
    const link = buildShareToVeriVerseUrl({ text: "  hello world  " });
    expect(new URL(link).searchParams.get("text")).toBe("hello world");
  });

  it("handles null/undefined fields the same as absent ones", () => {
    const link = buildShareToVeriVerseUrl({ text: null, url: undefined, title: null });
    expect(link).toBe("https://www.veriverse.io/verify");
  });
});

describe("buildShareToVeriVerseUrl - Unicode", () => {
  it("round-trips Unicode text correctly through URL encoding", () => {
    const text = "L'économie a chuté de 3% — 日本語のテスト";
    const link = buildShareToVeriVerseUrl({ text });
    expect(new URL(link).searchParams.get("text")).toBe(text);
  });
});
