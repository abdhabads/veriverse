// browser-extension/lib/buildVeriVerseLink.js
//
// P5.4: pure, side-effect-free link-building logic for the browser
// extension. Deliberately NOT importing lib/shareToVeriVerseLink.ts from
// the main app: this extension ships as static, unbundled files loaded
// directly by the browser ("Load unpacked"), with no TypeScript/Next.js
// build step, so pulling in a .ts module (and its own import of
// lib/siteConfig.ts) would require bundling machinery this extension
// intentionally has none of. This file is instead kept behavior-identical
// by contract: same field names (text/url/title), same length bounds, and
// the same fixed VeriVerse origin - proven by tests/buildVeriVerseLink.test.js
// mirroring lib/shareToVeriVerseLink.test.ts's own cases.
//
// Nothing in this file touches a Chrome API, the network, or storage of
// any kind - it only turns plain strings into a URL string.
export const VERIVERSE_ORIGIN = "https://www.veriverse.io";

// Mirrors lib/shareToVeriVerseLink.ts's own bounds exactly.
export const MAX_SHARE_TEXT_LENGTH = 1000;
export const MAX_SHARE_URL_LENGTH = 2048;
export const MAX_SHARE_TITLE_LENGTH = 200;

function clamp(value, maxLength) {
  if (!value) return "";
  return value.trim().slice(0, maxLength);
}

// True only for schemes the existing P5.2 URL-verification path can ever
// act on - deliberately excludes chrome://, edge://, about:, extension
// pages, and any other browser-internal URL a toolbar click might see.
export function isShareableUrl(url) {
  if (typeof url !== "string") return false;
  return /^https?:\/\//i.test(url);
}

// Same three-field, same-precedence contract as
// lib/shareToVeriVerseLink.ts's buildShareToVeriVerseUrl - pure string
// construction, no validation, no network.
export function buildVeriVerseUrl({ text, url, title } = {}) {
  const params = new URLSearchParams();
  const clampedText = clamp(text, MAX_SHARE_TEXT_LENGTH);
  const clampedUrl = clamp(url, MAX_SHARE_URL_LENGTH);
  const clampedTitle = clamp(title, MAX_SHARE_TITLE_LENGTH);

  if (clampedText) params.set("text", clampedText);
  if (clampedUrl) params.set("url", clampedUrl);
  if (clampedTitle) params.set("title", clampedTitle);

  const query = params.toString();
  return `${VERIVERSE_ORIGIN}/verify${query ? `?${query}` : ""}`;
}

// Toolbar click: no text selection exists, so only the page itself is
// context. Never includes a URL the browser considers internal.
export function buildToolbarShareParams(tab) {
  const tabUrl = tab && tab.url;
  const tabTitle = tab && tab.title;
  return {
    url: isShareableUrl(tabUrl) ? tabUrl : "",
    title: tabTitle || "",
  };
}

// Context-menu click: the user's selection is the primary content; the
// page URL/title ride along as the same optional context a toolbar click
// would send.
export function buildContextMenuShareParams(info, tab) {
  const tabUrl = tab && tab.url;
  const tabTitle = tab && tab.title;
  return {
    text: info && info.selectionText ? info.selectionText : "",
    url: isShareableUrl(tabUrl) ? tabUrl : "",
    title: tabTitle || "",
  };
}
