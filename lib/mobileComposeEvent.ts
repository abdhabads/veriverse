// lib/mobileComposeEvent.ts
// P2.10: the mobile bottom-nav Compose action needs to open Feed's mobile
// compose sheet even when the user is already on /feed, where a same-route
// `<Link href="/feed?compose=1">` navigation doesn't remount the page (so
// the query-param mount effect never re-fires). A tiny window event avoids
// both a Feed<->shell state coupling and reintroducing useSearchParams
// (Feed deliberately reads window.location.search once on mount instead,
// to avoid the Suspense/CSR bailout that hook forces).
export const MOBILE_COMPOSE_EVENT = "veriverse:open-mobile-composer";

export function requestMobileCompose() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MOBILE_COMPOSE_EVENT));
  }
}
