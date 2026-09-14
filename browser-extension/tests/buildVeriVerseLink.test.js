// browser-extension/tests/buildVeriVerseLink.test.js
//
// Focused, dependency-free tests for the extension's own pure link-builder
// - run with Node's built-in test runner (no vitest/jest, no build step),
// mirroring tests/unit/shareToVeriVerseLink.test.ts's own cases to prove
// behavioral parity with the P5.3 app-side helper.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildVeriVerseUrl,
  buildToolbarShareParams,
  buildContextMenuShareParams,
  isShareableUrl,
  MAX_SHARE_TEXT_LENGTH,
  MAX_SHARE_URL_LENGTH,
  MAX_SHARE_TITLE_LENGTH,
} from "../lib/buildVeriVerseLink.js";

test("builds a text-only deep link", () => {
  const link = buildVeriVerseUrl({ text: "The sky is blue." });
  assert.equal(link, "https://www.veriverse.io/verify?text=The+sky+is+blue.");
});

test("builds a url-only deep link", () => {
  const link = buildVeriVerseUrl({ url: "https://example.com/article" });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("url"), "https://example.com/article");
});

test("preserves text, url, and title together", () => {
  const link = buildVeriVerseUrl({
    text: "A specific claim",
    url: "https://example.com/",
    title: "Example Title",
  });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("text"), "A specific claim");
  assert.equal(parsed.searchParams.get("url"), "https://example.com/");
  assert.equal(parsed.searchParams.get("title"), "Example Title");
});

test("encodes special characters correctly", () => {
  const link = buildVeriVerseUrl({ text: "50% growth & rising — really?" });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("text"), "50% growth & rising — really?");
});

test("returns a bare /verify link when nothing is provided", () => {
  assert.equal(buildVeriVerseUrl({}), "https://www.veriverse.io/verify");
});

test("truncates text at MAX_SHARE_TEXT_LENGTH", () => {
  const longText = "a".repeat(MAX_SHARE_TEXT_LENGTH + 500);
  const link = buildVeriVerseUrl({ text: longText });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("text").length, MAX_SHARE_TEXT_LENGTH);
});

test("truncates url at MAX_SHARE_URL_LENGTH", () => {
  const longUrl = `https://example.com/${"a".repeat(MAX_SHARE_URL_LENGTH)}`;
  const link = buildVeriVerseUrl({ url: longUrl });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("url").length, MAX_SHARE_URL_LENGTH);
});

test("truncates title at MAX_SHARE_TITLE_LENGTH", () => {
  const longTitle = "b".repeat(MAX_SHARE_TITLE_LENGTH + 50);
  const link = buildVeriVerseUrl({ url: "https://example.com/", title: longTitle });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("title").length, MAX_SHARE_TITLE_LENGTH);
});

test("isShareableUrl accepts only http(s) URLs", () => {
  assert.equal(isShareableUrl("https://example.com/"), true);
  assert.equal(isShareableUrl("http://example.com/"), true);
  assert.equal(isShareableUrl("chrome://extensions"), false);
  assert.equal(isShareableUrl("edge://settings"), false);
  assert.equal(isShareableUrl("about:blank"), false);
  assert.equal(isShareableUrl(undefined), false);
  assert.equal(isShareableUrl(""), false);
});

test("toolbar action on a normal HTTPS page carries url and title", () => {
  const params = buildToolbarShareParams({ url: "https://example.com/article", title: "Example Article" });
  assert.deepEqual(params, { url: "https://example.com/article", title: "Example Article" });
});

test("toolbar action on an unsupported tab URL omits the url rather than crashing", () => {
  const params = buildToolbarShareParams({ url: "chrome://extensions", title: "Extensions" });
  assert.equal(params.url, "");
  assert.equal(params.title, "Extensions");
});

test("toolbar action tolerates a missing/undefined tab", () => {
  assert.doesNotThrow(() => buildToolbarShareParams(undefined));
  const params = buildToolbarShareParams(undefined);
  assert.deepEqual(params, { url: "", title: "" });
});

test("context-menu action carries selected text plus page url and title", () => {
  const params = buildContextMenuShareParams(
    { selectionText: "Selected claim text" },
    { url: "https://example.com/page", title: "Page Title" }
  );
  assert.deepEqual(params, {
    text: "Selected claim text",
    url: "https://example.com/page",
    title: "Page Title",
  });
});

test("context-menu action with a missing title still preserves text and url", () => {
  const params = buildContextMenuShareParams(
    { selectionText: "Selected claim text" },
    { url: "https://example.com/page" }
  );
  assert.equal(params.text, "Selected claim text");
  assert.equal(params.url, "https://example.com/page");
  assert.equal(params.title, "");
});

test("context-menu action on an unsupported tab URL omits the url", () => {
  const params = buildContextMenuShareParams({ selectionText: "Some text" }, { url: "chrome://newtab" });
  assert.equal(params.url, "");
});

test("full toolbar pipeline: tab -> params -> final deep link", () => {
  const params = buildToolbarShareParams({ url: "https://example.com/article", title: "Example Article" });
  const link = buildVeriVerseUrl(params);
  const parsed = new URL(link);
  assert.equal(parsed.origin, "https://www.veriverse.io");
  assert.equal(parsed.pathname, "/verify");
  assert.equal(parsed.searchParams.get("url"), "https://example.com/article");
  assert.equal(parsed.searchParams.get("title"), "Example Article");
  assert.equal(parsed.searchParams.has("text"), false);
});

test("full context-menu pipeline: selection + tab -> params -> final deep link", () => {
  const params = buildContextMenuShareParams(
    { selectionText: "The Bank of England cut rates to 3%" },
    { url: "https://example.com/news", title: "News Article" }
  );
  const link = buildVeriVerseUrl(params);
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("text"), "The Bank of England cut rates to 3%");
  assert.equal(parsed.searchParams.get("url"), "https://example.com/news");
  assert.equal(parsed.searchParams.get("title"), "News Article");
});
