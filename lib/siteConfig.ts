// lib/siteConfig.ts
//
// The one canonical production origin, for server-side use only (metadata,
// canonical URLs, share-URL construction that runs outside the browser).
// Deliberately does not touch client-side origin derivation - lib/shareLink.ts's
// existing sharePost() correctly uses window.location.origin for the
// already-working Post share flow, and that is left unchanged.
//
// No env var currently exists for this (confirmed absent at P3.2's audit:
// no NEXT_PUBLIC_SITE_URL, no metadataBase, no site-origin constant anywhere
// in the repo) - a single hardcoded constant is the smallest correct fix,
// not environment/config complexity.
export const SITE_ORIGIN = "https://www.veriverse.io";

export function buildCanonicalUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
