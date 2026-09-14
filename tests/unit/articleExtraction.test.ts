// tests/unit/articleExtraction.test.ts
import { describe, it, expect } from "vitest";
import { extractArticleContent, MAX_EXTRACTED_TEXT_LENGTH } from "@/lib/articleExtraction";

describe("extractArticleContent - title", () => {
  it("extracts the page title", () => {
    const html = "<html><head><title>My Article Title</title></head><body>text</body></html>";
    expect(extractArticleContent(html).title).toBe("My Article Title");
  });

  it("returns null when no title is present", () => {
    const html = "<html><body>text with no title</body></html>";
    expect(extractArticleContent(html).title).toBeNull();
  });
});

describe("extractArticleContent - content preference order", () => {
  it("prefers <article> content over the rest of the page", () => {
    const html = `
      <html><body>
        <nav>Home | About</nav>
        <article><p>The reef spans two thousand kilometers.</p></article>
        <footer>Copyright 2026</footer>
      </body></html>`;
    const result = extractArticleContent(html);
    expect(result.text).toContain("reef spans two thousand kilometers");
    expect(result.text).not.toContain("Home");
    expect(result.text).not.toContain("Copyright");
  });

  it("falls back to <main> when there is no <article>", () => {
    const html = `<html><body><nav>nav text</nav><main><p>main content here</p></main></body></html>`;
    const result = extractArticleContent(html);
    expect(result.text).toContain("main content here");
    expect(result.text).not.toContain("nav text");
  });

  it("falls back to body text (chrome stripped) when there is neither article nor main", () => {
    const html = `<html><body><nav>nav text</nav><p>plain body content</p><footer>footer text</footer></body></html>`;
    const result = extractArticleContent(html);
    expect(result.text).toContain("plain body content");
    expect(result.text).not.toContain("nav text");
    expect(result.text).not.toContain("footer text");
  });
});

describe("extractArticleContent - script/style never leak into text", () => {
  it("strips script and style content entirely", () => {
    const html = `
      <html><body>
        <article>
          <script>alert('should never appear');</script>
          <style>.hidden { display: none; }</style>
          <p>The visible claim text.</p>
        </article>
      </body></html>`;
    const result = extractArticleContent(html);
    expect(result.text).toContain("The visible claim text");
    expect(result.text).not.toContain("alert");
    expect(result.text).not.toContain("display: none");
  });

  it("never executes script content - node-html-parser is a pure tokenizer", () => {
    // Regression-shaped: this only proves nothing throws/executes and the
    // literal script text is excluded, not a sandbox-escape test.
    const html = `<html><body><article><script>throw new Error("should never run")</script><p>ok</p></article></body></html>`;
    expect(() => extractArticleContent(html)).not.toThrow();
    expect(extractArticleContent(html).text).toBe("ok");
  });
});

describe("extractArticleContent - whitespace normalization", () => {
  it("collapses whitespace/newlines into single spaces", () => {
    const html = `<html><body><article><p>Line one.\n\n\t\tLine   two.</p></article></body></html>`;
    const result = extractArticleContent(html);
    expect(result.text).toBe("Line one. Line two.");
  });
});

describe("extractArticleContent - bounded length", () => {
  it("never returns text longer than MAX_EXTRACTED_TEXT_LENGTH", () => {
    const longParagraph = "word ".repeat(2000);
    const html = `<html><body><article><p>${longParagraph}</p></article></body></html>`;
    const result = extractArticleContent(html);
    expect(result.text.length).toBeLessThanOrEqual(MAX_EXTRACTED_TEXT_LENGTH);
  });
});

describe("extractArticleContent - empty/malformed input", () => {
  it("returns empty text rather than throwing for a page with no usable text", () => {
    const html = `<html><head><title>Empty</title></head><body><nav>only nav</nav></body></html>`;
    const result = extractArticleContent(html);
    expect(result.text).toBe("");
  });

  it("does not throw on malformed/incomplete HTML", () => {
    expect(() => extractArticleContent("<html><body><p>unclosed")).not.toThrow();
    expect(() => extractArticleContent("")).not.toThrow();
    expect(() => extractArticleContent("not even html at all")).not.toThrow();
  });
});
