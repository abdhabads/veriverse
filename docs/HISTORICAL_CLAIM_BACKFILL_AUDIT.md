# Historical Claim Backfill — Final Audit

Status as of 2026-09-07. This is the closing record for the historical Claim-resolution backfill effort. It exists so that "unlinked" is distinguishable from "forgotten": every one of the 32 pre-`2957b78` production posts with `Post.claimId: null` has an explicit, recorded disposition below, not a silent gap.

## 1. Background

Commits `2957b78`/`4c13926` brought the Claim/Evidence/TrustAssessment trust engine and Shadow Mode into version control and production for the first time via a proper GitHub → Vercel deployment. Prior to that, 32 production posts (created 2026-08-21 through 2026-09-06) had been evaluated by earlier, non-git-tracked deployments that never included claim-resolution code at all — `Post.claimId` was `null` for all 32, not because resolution failed, but because the code path performing it had never been live. See the deployment-forensics investigation earlier in this engagement for the full evidence trail establishing that root cause.

This document does not revisit that investigation; it records the outcome of deliberately, selectively backfilling a subset of those 32 posts using the mechanism built for that purpose (`scripts/backfill-historical-claims.ts`, `models/HistoricalClaimBackfillCheckpoint.ts`).

## 2. Mechanism summary

Built and hardened across six commits, each independently reviewed, tested (`tsc`/`vitest`/`build`), and deployed before being used:

| Commit | Purpose |
|---|---|
| `2957b78` | Trust engine + Shadow Mode baseline brought into git (prerequisite, not backfill-specific) |
| `4c13926` | Unrelated compatibility fix required for that baseline to build |
| `8496074` | Removed temporary success-path diagnostics added during the original Claim-resolution investigation |
| `0723093` | Added the backfill script and checkpoint model |
| `ac8dfbe` | Hardened the non-claim skip gate (`classifiedContentType === question/instruction` → skip, independent of eligibility bucket) |
| `74812a7` | Fixed `attemptCount`/`lastAttemptAt` persistence on no-op retries |

Design properties, each empirically verified against production rather than assumed:
- **Dry-run is zero-write** — verified by code trace and by repeated production dry-runs that changed nothing.
- **Idempotent and resumable** — a `HistoricalClaimBackfillCheckpoint` document (not `Post.claimId` alone) is the authoritative per-post recovery state, because `Post.claimId: null` cannot distinguish "never touched" from "partially processed," and `Claim`/`TrustAssessment` state is shared across posts that converge on the same claim.
- **Assessment-version concurrency-safe** — a candidate `TrustAssessment` is only accepted once its evidence-reference union is proven to include this run's own evidence; a same-version assessment computed from a stale snapshot is rejected and a fresh version is minted instead. This addressed a concrete race condition identified during design review; the production backfill runs themselves did not encounter concurrent assessment-version contention.
- **Bounded** — the script operates only on a hardcoded list of the 32 known post IDs, never an open-ended query.
- **Fully separate from the settlement/reputation rewrite** — verified by repeated cross-boundary grep of staged content at every commit; zero references.

## 3. Full 32-post disposition

### Linked (9)

| Post ID | Content | Claim ID | TrustAssessment band | Evidence count |
|---|---|---|---|---|
| `6a91b8ff1f713246a5ae4c9a` | "The human heart has four chambers." | `6a9f2001...3ada` | weakly_supported | 2 |
| `6a91bb36a1bdea3e52226d2b` | "Water boils at 100 degrees Celsius at sea level" | `6a9f200b...3adf` | weakly_supported | 3 |
| `6a9c7ab45c99b2efbbb30789` | "Nigeria has 36 states and the Federal Capital Territory" | `6a9f2016...3ae5` | weakly_supported | 4 |
| `6a9c8390b2ee5552c1cd6967` | "Mount Everest is the tallest mountain above sea level on Earth" | `6a9f2022...3aec` | weakly_supported | 3 |
| `6a9c83b6b2ee5552c1cd6968` | "The human body has 206 bones in adulthood" | `6a9f202d...3af2` | weakly_supported | 3 |
| `6a9c83d6b2ee5552c1cd6969` | "The Great Wall of China is over 13,000 miles long" | `6a9f203b...3af8` | weakly_supported | 4 |
| `6a9149f9284be67c667a83fd` | "A daily detox regimen helps eliminate accumulated toxins from the body." | `6a9f24fc...1583` | **contradicted** (2 Healthline sources, no support found) | 2 |
| `6a91fe49f1e75ac199e5df35` | "Regular eye examinations can help detect certain eye diseases..." | `6a9f2507...1588` | weakly_supported (CDC + NEI, independent, high-authority) | 2 |
| `6a91d808c849f39285f476c7` | "Zabiri has his first Hatrick in La Liga #sport" | `6a9f262a...c79b` | weakly_supported (5 sources, entity/event verified consistent across two independent grounding runs) | 5 |

All nine: `claimWasNewlyCreated: true`, no duplicate Claims, no assessment-version churn, no settlement/reputation collection touched, batches independently idempotency-tested where applicable (the first six-post batch was rerun twice — once pre- and once post-bookkeeping-fix — both confirmed complete no-ops for Claim/Evidence/TrustAssessment/Post).

### Held — deliberately excluded, stored-claim candidates (3)

| Post ID | Content | Reason |
|---|---|---|
| `6a909e541c9888802499eef6` | "Masha Allah this is welcome development" | Reaction/opinion, not a verifiable factual assertion |
| `6a9400bd9a03dc58f200aab9` | "Opay are going on a break starting 1st septembber" | Underspecified: no year, ambiguous scope of "going on a break," time-sensitive enough that historical grounding risks attaching unrelated current material |
| `6a9dec31f41b099603f14cdd` | "marriage means two people becoming one" | Definitional/metaphorical, not an objectively resolvable proposition |

### Skipped — stored questions, correctly bypass claim resolution (3)

`6a91f9bc8867d0b70115afaf`, `6a97fbbb14d4bce652198ed1`, `6a9836369ce457da42ceb788` — all `contentType: "question"`, no Claim/Evidence/TrustAssessment created, per design.

### Held — manual-review, untouched (17)

Reclassified live during dry-run for reporting purposes only; **never approved, never applied**. Four resolve cleanly to question/instruction and would just skip if ever approved (no backfill value in doing so): `6a89de0b0d4f9e4b0eb12c24`, `6a8c9a14b6e98803ad2d633e`, `6a8ebd4eee94e037f2b64dbc`, `6a8ebdb8f8c1ab8399a14440`. The remaining 13 are live-classified `claim` but were deliberately held as a content-curation decision separate from validating the migration mechanism: `6a87b402690832f97d78ecd8`, `6a880ea20110baab6cdd5bb7`, `6a88627cb7d2df869ac4080d`, `6a889ea8ec874c5411441356`, `6a898516b39529fc99d13b3e`, `6a89d59ad0a467c2fc1adb47`, `6a89d99a53aa13ab00c0bd3c`, `6a8bf58df08fa9c44c0cbc7c`, `6a8c8ee5dd64d2b9afb9cb2b`, `6a8f60abbf71204e557f2507`, `6a901efd338b7b05c3b81cbc`, `6a90648f87e726ab3b73a71f` (converges with `6a8f60ab...` — identical identityKey, confirmed, never created), `6a90a06469494786cd851fca`.

**32 total**: 9 linked + 3 held (stored-claim) + 3 skipped (stored-question) + 17 held (manual-review) = 32. ✓

## 4. Production verification evidence accumulated

- Novel-claim, duplicate-claim-reuse, and negative-control smoke tests (Gaborone posts) — all PASS, prior to any historical work.
- Deployment/version forensics establishing why the 32 posts were never resolved.
- Design review closing two real concurrency gaps before any mutation: the evidence-completion-predicate gap (`EvidenceObject.contentHash` alone was proven insufficient) and the assessment-version race (adopting a same-version `TrustAssessment` on version number alone was proven unsafe under concurrent writes).
- Six-post first batch: clean apply, clean idempotent rerun (pre-fix), clean idempotent rerun (post-fix) — three separate production applications of the same six IDs with zero deviation.
- Two-post health-claim batch: differentiated outcomes (contradicted vs. weakly_supported) traced to source quality, not applied uniformly.
- Read-only entity-resolution diagnostic for the Zabiri post before approval, then a live apply whose independently-retrieved evidence (different sources than the diagnostic) still converged on the same person/event — direct evidence that entity resolution is robust across nondeterministic grounding runs, not a single lucky result.

## 5. Final production state

| | Before this backfill | After |
|---|---|---|
| Claims | 1 (Gaborone) | 10 |
| TrustAssessments | 2 | 11 |
| EvidenceObjects | 5 | 33 |
| Posts with `claimId` | 1 | 11 |
| `HistoricalClaimBackfillCheckpoint` documents | 0 | 9 |

Gaborone claim (`6a9ef3fb...`) unchanged throughout at assessment version 2. No settlement/reputation collection ever touched. No duplicate Claim ever created. Every checkpoint reached `post_linked` on its first successful attempt.

## 6. Closing statement

The backfill mechanism has been exercised for: new-claim creation, evidence persistence (with checkpoint-based recovery designed for non-atomic partial failures), assessment creation, checkpoint stage progression, cross-run idempotency, attempt-metadata bookkeeping, and real external-grounding nondeterminism — across three separate batches and nine linked posts, with zero deviation from expected behavior. Historical mutation stops here by deliberate decision, not because the remaining 23 posts are unresolvable — they are being left unlinked on purpose, for reasons recorded above, distinct from the mechanism's own correctness. Any future decision to link `6a9400bd…`, `6a9dec31…`, `6a909e54…`, or any of the 17 manual-review posts is a content-curation call for a separate occasion, not a continuation of this validation effort.
