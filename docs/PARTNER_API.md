# VeriVerse Partner API (P5.5)

A controlled, server-to-server API for trusted partners/integrators to
submit factual text or a public webpage URL and receive VeriVerse's
existing Claim-resolution / current-assessment result. This is not a
public AI endpoint - it is a thin, authenticated, rate-limited window
into the same verification capability already exposed to the logged-in
web app at `/api/verify` (see P5.1/P5.2/P5.3).

**Server-to-server only.** Never embed a partner API key in browser
JavaScript, a mobile app bundle, or any other client a third party could
inspect. A partner's backend calls this API; a partner's frontend renders
UI the partner's own backend controls. A future public, browser-safe
embed (a hosted widget/iframe with no reusable secret) is out of scope
for this phase.

## Endpoint

```
POST /api/v1/verify
```

## Authentication

Every request requires an API key, supplied as:

```
Authorization: Bearer <key>
```

The key must never be sent as a query parameter, in the URL path, or in
the request body - only the `Authorization` header is read. A missing
header, a non-`Bearer` scheme, or an unrecognized key all return the same
`401` response, so a caller learns nothing about which failure occurred.

Keys are configured server-side only, via the `PARTNER_API_KEYS`
environment variable (never committed, never placed in
`.env.production` in source control - configure it directly in your
deployment platform). Format is a comma-separated list of
`<partnerId>:<key>:<capability>` triples:

```
PARTNER_API_KEYS=acme:sk_live_REPLACE_ME:lookup_only,example:sk_live_REPLACE_ME_TOO:verify
```

There is no key-management UI or database-backed key store in this
phase - rotating or revoking a key means editing this environment
variable and redeploying.

### Capability

Each key has exactly one capability:

- **`lookup_only`** - may classify input and read an existing Claim's
  current assessment. Can never create a new Claim, trigger grounding, or
  invoke AI verification, even for a brand-new or previously-unassessed
  claim. See "No silent fallback" below.
- **`verify`** - may additionally trigger the expensive verification path
  (grounding + AI assessment) for a new or previously-unassessed claim,
  subject to the expensive-verification quota below.

## Request

Exactly one of `text` or `url` is required. Sending both, or neither,
returns `400`.

```json
{ "text": "The Bank of England cut interest rates to 3%." }
```

or

```json
{ "url": "https://example.com/some-article" }
```

- `text`: up to 1000 characters (same bound as the web app's Verify Text).
- `url`: must be a public `http://` or `https://` URL. The same
  SSRF-hardened acquisition path used by the web app's Verify URL applies
  unchanged - private/internal addresses, non-HTML responses, oversized
  pages, excessive redirects, and slow responses are all rejected the
  same way (see P5.2). No new network stack was built for this API.

## Response

```json
{
  "apiVersion": "v1",
  "contentType": "claim",
  "extractedClaim": "The Bank of England cut interest rates to 3%.",
  "claimId": "651f...",
  "resolution": "existing",
  "assessmentStatus": "available",
  "verificationRequired": false,
  "verificationPermitted": true,
  "canonicalClaimUrl": "https://www.veriverse.io/claims/651f...",
  "assessment": {
    "band": "well_supported",
    "confidence": "medium",
    "explanation": "Available evidence currently provides strong support for this claim (3 supporting sources)."
  }
}
```

URL-mode requests additionally include `submittedUrl`, `finalUrl` (after
any redirect), and `pageTitle`.

`assessment` is `null` whenever `assessmentStatus` is
`"assessment_not_available"` (no current assessment exists yet).

### No silent fallback (`lookup_only` keys)

A `lookup_only` key that resolves to a new or previously-unassessed claim
receives:

```json
{ "verificationRequired": true, "verificationPermitted": false, "assessment": null, ... }
```

This is a normal `200` response, not an error - it tells the caller
verification would be needed but this key cannot itself request it. It
never silently runs the expensive path on the caller's behalf.

### Fields deliberately never returned

Claim `identityKey`, similarity/match scores, AI-risk fields, raw model
reasoning, raw `TrustAssessment` reason arrays, evidence authority
scores, DNS/IP/redirect-chain fetch internals, or any internal model
version. `assessment.explanation` is the same deterministic, templated
sentence already shown on public Claim pages - never raw AI output.

## Status codes

| Status | Meaning |
|---|---|
| 200 | Success (including `no_claim_found` and `verificationRequired: true` outcomes) |
| 400 | Missing/invalid input (neither or both of text/url, text too long or empty) |
| 401 | Missing, malformed, or unrecognized API key |
| 422 | URL could not be safely or usefully retrieved (unsafe address, wrong content type, no extractable content, etc.) |
| 429 | Rate limit or expensive-verification quota exceeded |
| 5xx | Internal failure - never includes stack traces, DNS answers, blocked-IP details, or upstream provider errors |

`403` is reserved for a future capability-scoped restriction; the current
minimal capability model (`lookup_only` / `verify`) handles authorization
entirely through `200`-status fields (`verificationRequired` /
`verificationPermitted`) rather than an error status, so no request in
this phase currently returns it.

## Rate limits and quota

- **General traffic**: 30 requests/minute per partner key, separate from
  the web app's own `verify_text`/`verify_url_fetch` buckets.
- **Expensive-verification quota** (`verify`-capable keys only): 20
  verifications/day per partner key. This is a conservative, intentionally
  temporary, per-process approximation (VeriVerse's rate limiter is
  in-memory, not a durable cross-instance store yet) - not a hard
  guarantee across server restarts or multiple concurrent instances. A
  durable quota system is follow-up work if partner volume ever requires
  it.

Reusing an already-assessed Claim (the common case) never counts against
the expensive-verification quota - only requests that actually invoke
grounding/AI do.

## Idempotency

Repeating the same request against an already-assessed Claim always
returns the same authoritative current assessment - it never advances the
assessment version, re-runs grounding, or duplicates evidence, regardless
of how many times it's called.

## What this API never does

- Never creates a Post, and never calls any post-creation endpoint.
- Never persists a partner's submitted URL beyond the request, and never
  stores a snapshot of extracted article text.
- Never logs a raw API key, full submitted text, or full article body -
  only partner ID, capability, mode, response status, and duration.
- Never accepts a key anywhere but the `Authorization` header.
