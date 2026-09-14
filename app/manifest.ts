// app/manifest.ts
//
// P5.3: the smallest standards-compliant manifest needed to make VeriVerse
// a valid Web Share Target - not a PWA installability programme. No
// service worker, no offline caching, no install-prompt UX is added here
// or implied by this file's existence.
//
// share_target uses GET deliberately (see lib/externalVerification.ts's
// own P5.1/P5.2 principle): sharing something to VeriVerse must only ever
// navigate to /verify with the shared fields pre-filled for review, never
// mutate anything - a GET share target can only ever produce a plain
// navigation, structurally incapable of the pipeline's own expensive
// verification/Claim-creation path running automatically. The `title`/
// `text`/`url` param names match the standard Web Share Target fields
// verbatim, which app/verify/page.tsx reads as ordinary, untrusted query
// parameters - the exact same code path a hand-typed deep link exercises.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VeriVerse",
    short_name: "VeriVerse",
    description: "Verify. Trust. Earn.",
    start_url: "/verify",
    display: "browser",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    share_target: {
      action: "/verify",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
  };
}
