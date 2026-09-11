// lib/discoveryPresentation.ts
// P2.7: a single, small pure helper so Feed's "Evidence Highlights" module
// reads the same canonical verdict every other surface does, instead of
// re-deriving its own notion of "verified" from the raw backend `status`
// field. The P2.7 audit found `post.status === "verified"` could disagree
// with getTrustVerdict() entirely - e.g. a post whose status was still
// "verified" but which now has a contradiction or an expert rejection on
// record would have kept showing here, even though its canonical verdict
// says otherwise. Deliberately kept out of lib/trustPresentation.ts itself
// (that file's own precedence/threshold logic is untouched) - this only
// *consumes* getTrustVerdict()'s output, never re-derives it.
//
// Named "Evidence Highlights" (not "Verified Highlights") because the
// selector below intentionally includes every canonical "positive" tier -
// Expert Verified, Well Supported, and the weaker Supported band. Calling
// a merely-"Supported" claim "Verified" overstates it; the module - and
// this helper's name - describe what the selector actually is: a
// positive-evidence filter, not a verification-only one.
import { getTrustVerdict, type TrustVerdictInput } from "@/lib/trustPresentation";

// "positive" tone covers every verdict tier P2.4 already treats as
// favorable (Expert Verified, Well Supported, Supported) - reusing the
// canonical tone means this can never disagree with what the post's own
// TrustVerdictBadge/TrustSummaryLine is showing elsewhere on the page.
export function isEvidenceHighlight(post: TrustVerdictInput): boolean {
  return getTrustVerdict(post).tone === "positive";
}
