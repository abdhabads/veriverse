// lib/shareToVeriVerseLink.ts
//
// P5.3: URL/deep-link generation ONLY for the inbound "Share to VeriVerse"
// front door - deliberately separate from lib/shareLink.ts, which shares
// existing VeriVerse content OUT (a Claim/Post's own canonical URL). This
// file goes the other direction: turning arbitrary external text/URL/title
// into a deep link that opens VeriVerse's /verify page with that content
// pre-filled for review. It contains no verification semantics of its own -
// the resulting link never fetches, classifies, or resolves anything by
// itself; it only pre-fills a page a human must still act on.
//
// Kept intentionally reusable beyond the manifest share_target wired up in
// app/manifest.ts: the same contract is what a future bookmarklet or
// browser extension would need to invoke (selected text + current page URL
// -> this same query-string shape), and what a partner integration could
// link to directly.
import { buildCanonicalUrl } from "@/lib/siteConfig";

// Mirrors app/verify/page.tsx's own Text-mode limit (Post.content's
// existing 1000-char boundary, reused throughout P5.1/P5.2) - re-exported
// from here so the receiving page and this generator never drift into two
// independently-maintained "1000"s.
export const MAX_SHARE_TEXT_LENGTH = 1000;
// A conservative, conventional practical URL length bound - generous for
// any real webpage URL, small enough to keep a shared deep link itself
// well-formed.
export const MAX_SHARE_URL_LENGTH = 2048;
// Display-only context, never fed into Claim identity - kept short.
export const MAX_SHARE_TITLE_LENGTH = 200;

function clamp(value: string | null | undefined, maxLength: number): string {
  if (!value) return "";
  return value.trim().slice(0, maxLength);
}

export type ShareToVeriVerseParams = {
  text?: string | null;
  url?: string | null;
  title?: string | null;
};

// Pure generation - never validates the URL, never classifies the text,
// never touches the network. All three inputs are optional and independent;
// the receiving page (app/verify/page.tsx) decides what to do with
// whichever arrived.
export function buildShareToVeriVerseUrl(params: ShareToVeriVerseParams): string {
  const search = new URLSearchParams();

  const text = clamp(params.text, MAX_SHARE_TEXT_LENGTH);
  const url = clamp(params.url, MAX_SHARE_URL_LENGTH);
  const title = clamp(params.title, MAX_SHARE_TITLE_LENGTH);

  if (text) search.set("text", text);
  if (url) search.set("url", url);
  if (title) search.set("title", title);

  const query = search.toString();
  return buildCanonicalUrl(`/verify${query ? `?${query}` : ""}`);
}
