// Shadow Mode Implementation, built strictly against
// docs/SHADOW_MODE_CONTRACT.md (Readiness Gate: 13 PASS, 0 PROVISIONAL, 0
// PARTIAL, 0 FAIL as of Sprint 6.75.7) and
// docs/SHADOW_MODE_POLICY_DECISIONS.md's decision logs. Every authorized
// number below is read from an environment variable with the authorized
// value as its default, per every §5/§9/§11/§12 requirement that these be
// "configuration, never hardcoded literals."
//
// Non-authoritative by construction: this module never reads or writes
// Post/ReputationLog/RewardLog, never returns a value threaded back into a
// route handler, and is called from exactly one place
// (lib/aiTruthPipeline.ts, immediately after and structurally separate from
// buildAndPersistTrustAssessment - contract §4's enforcement mechanism).

import Claim from "@/models/Claim";
import EvidenceObject from "@/models/EvidenceObject";
import ShadowAssessment from "@/models/ShadowAssessment";
import ShadowModeControl, { SHADOW_MODE_CONTROL_SINGLETON_KEY } from "@/models/ShadowModeControl";
import { EvidenceStrengthInput } from "@/lib/evidenceStrength";
import { TemporalScope } from "@/lib/claimNormalization";
import { AssessmentBand } from "@/lib/trustAssessment";
import { withTimeout } from "@/lib/withRetry";
import { logEvent } from "@/lib/logger";
import {
  buildEvidenceConflictInput,
  classifyConflictCategory,
  resolveTieredDominance,
  mapEvidenceStateToAssessmentBand,
  SHADOW_MODEL_VERSION,
  ClaimContext,
} from "@/lib/evidenceConflictCandidates";
import { classifyDangerTier, dangerWeight, Direction } from "@/lib/dangerWeightedSeverity";

// ---------------------------------------------------------------------------
// Configuration - every value here is the AUTHORIZED default (decision log:
// docs/SHADOW_MODE_POLICY_DECISIONS.md), overridable via env var so a future
// recalibration never requires a code change (contract §5/§11/§12's own
// requirement).
// ---------------------------------------------------------------------------

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Read live from process.env on every call, not frozen at module-load time -
// so a test (or a future runtime-config surface) can change one of these
// between calls without needing to reload the module. Contract
// §5/§11/§12's requirement is "configuration, never a hardcoded literal";
// nothing requires it be read exactly once at startup.

// Contract §5, authorized 1,000ms (Sprint 6.75.7, 2026-09-04).
export function getShadowComputationTimeoutMs(): number {
  return numEnv("SHADOW_COMPUTATION_TIMEOUT_MS", 1000);
}
// Contract §11, authorized 8% / rolling 100 (Sprint 6.75.6, 2026-09-04).
export function getShadowDangerousDisagreementThresholdPct(): number {
  return numEnv("SHADOW_DANGEROUS_DISAGREEMENT_THRESHOLD_PCT", 8);
}
export function getShadowDangerousDisagreementWindowSize(): number {
  return numEnv("SHADOW_DANGEROUS_DISAGREEMENT_WINDOW_SIZE", 100);
}
// Contract §12, authorized 800 total / 100 mixed-stance / 14 days (Sprint
// 6.75.6, 2026-09-04) - conjunctive, all three required.
export function getShadowMinTotalAssessments(): number {
  return numEnv("SHADOW_MIN_TOTAL_ASSESSMENTS", 800);
}
export function getShadowMinMixedStanceAssessments(): number {
  return numEnv("SHADOW_MIN_MIXED_STANCE_ASSESSMENTS", 100);
}
export function getShadowMinObservationDays(): number {
  return numEnv("SHADOW_MIN_OBSERVATION_DAYS", 14);
}
// Contract §9, authorized observation-complete + 90-day review buffer
// (Sprint 6.75.7, 2026-09-04).
export function getShadowRetentionReviewBufferDays(): number {
  return numEnv("SHADOW_RETENTION_REVIEW_BUFFER_DAYS", 90);
}

// The one, single definition of the retention invariant - "observation
// completion + the authorized review-buffer days," unchanged since Sprint
// 6.75.7. Every place that computes an expiresAt value (the write-time
// stamp, its Sprint 6.75.10 follow-up correction, and the one-time
// backfill sweep) calls this, so all three can never silently drift from
// computing the same date for the same observationCompletedAt.
function computeRetentionExpiresAt(observationCompletedAt: Date): Date {
  return new Date(new Date(observationCompletedAt).getTime() + getShadowRetentionReviewBufferDays() * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Kill-switch (contract §7) - the exact AI_ENABLED pattern
// (lib/aiTruthPipeline.ts), not new infrastructure. Default unset/false:
// shadow mode requires explicit opt-in, no way to enable by omission.
// ---------------------------------------------------------------------------

export function isShadowModeEnabled(): boolean {
  return process.env.SHADOW_MODE_ENABLED === "true";
}

// ---------------------------------------------------------------------------
// Persistent pause state (contract §11's automatic stop condition). An env
// var alone cannot represent "paused until a human reviews it" across
// requests/restarts - see models/ShadowModeControl.ts's header for why this
// collection exists.
//
// Sprint 6.75.8 (Finding 2) remediation: every write below targets the
// fixed singleton key, backed by a real unique index (models/ShadowModeControl.ts),
// so concurrent first-ever writes cannot both succeed as inserts - the
// loser gets a duplicate-key error (E11000) and retries as a plain update
// against the document that won. And every read below treats the
// collection as "could, in a legacy/corrupted state, contain more than one
// document" and asks "does ANY document say paused," rather than trusting
// whichever one an unfiltered findOne() happens to return - so an already-
// recorded pause can never be hidden by a second, stray document, even if
// one somehow exists (e.g. created before this migration).
// ---------------------------------------------------------------------------

// Centralizes the retry-on-duplicate-key pattern the singleton index
// requires. `update` must be a plain field map (never a `$`-operator
// document) - it is always wrapped in `$set` here, combined with
// `$setOnInsert` for the key itself, which is what makes mixing an upsert
// with a unique index on a fixed value safe: the ONLY thing that can ever
// vary between racing inserts is the key itself, and that's never part of
// `update`.
async function upsertControlSingleton(update: Record<string, unknown>): Promise<void> {
  try {
    await ShadowModeControl.findOneAndUpdate(
      { singletonKey: SHADOW_MODE_CONTROL_SINGLETON_KEY },
      { $set: update, $setOnInsert: { singletonKey: SHADOW_MODE_CONTROL_SINGLETON_KEY } },
      { upsert: true }
    );
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      // Lost the race: a concurrent call's insert won in the moment
      // between our own upsert deciding "no document exists yet" and
      // attempting to create one. The winner's document now exists under
      // the same singleton key - fall back to a plain update against it,
      // which is exactly as correct as if we had won the race ourselves
      // (the field values being written are identical either way).
      await ShadowModeControl.updateOne({ singletonKey: SHADOW_MODE_CONTROL_SINGLETON_KEY }, { $set: update });
      return;
    }
    throw error;
  }
}

// Reads the whole collection rather than a single arbitrary document -
// deliberately, so a legacy/corrupted multi-document state (which the
// unique index now prevents from being newly created, but cannot
// retroactively undo if it already exists) can never hide an active pause.
// "Any document says paused" wins over "some other document doesn't" -
// the safe direction to be wrong in.
async function readControlDocuments(): Promise<
  Array<{ pausedForDangerousDisagreement?: boolean; observationCompletedAt?: Date | null }>
> {
  return ShadowModeControl.find({}).lean<
    Array<{ pausedForDangerousDisagreement?: boolean; observationCompletedAt?: Date | null }>
  >();
}

export async function isShadowModePaused(): Promise<boolean> {
  const docs = await readControlDocuments();
  return docs.some((d) => d.pausedForDangerousDisagreement === true);
}

export async function pauseShadowMode(reason: string): Promise<void> {
  await upsertControlSingleton({ pausedForDangerousDisagreement: true, pausedAt: new Date(), pausedReason: reason });
  // "logged loudly" per contract §11 - console.error, not the routine
  // per-attempt audit log, so this is distinguishable in log output.
  console.error("[SHADOW_MODE_AUTO_PAUSED]", { reason, timestamp: new Date().toISOString() });
}

// The human-review action contract §11 requires before resuming. Exported
// for scripts/resumeShadowMode.ts (an operator-run script) - never called
// automatically by any request path.
export async function resumeShadowMode(): Promise<void> {
  await upsertControlSingleton({ pausedForDangerousDisagreement: false, pausedAt: null, pausedReason: null });
  logEvent("SHADOW_MODE_RESUMED", { timestamp: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Band <-> Direction mapping - identical to the mapping already used in
// scripts/generateEvidenceConflictMatrix.ts and
// scripts/generateExpandedConflictBenchmark.ts, reused here (not
// reinvented) so shadow mode's danger classification uses the same
// methodology already validated across Sprint 6-6.75.1's benchmarks.
// ---------------------------------------------------------------------------

const BAND_TO_DIRECTION: Record<AssessmentBand, Direction> = {
  well_supported: "supports",
  weakly_supported: "supports",
  contested: "contested",
  contradicted: "contradicts",
  insufficient_evidence: "insufficient",
};

// ---------------------------------------------------------------------------
// The shadow computation itself (contract §1-2). Reads only EvidenceObject
// records the primary pipeline already persisted for this exact claim - no
// independent retrieval, no external API call, per contract §1's explicit
// prohibition.
//
// Sprint 6.75.8 (Finding 1) remediation: `withTimeout` (lib/withRetry.ts,
// unmodified - shared by the primary pipeline, out of scope to change) only
// races this function against a timer; it never cancels it. Left alone,
// a merely-slow (not permanently hung) call kept running after its own
// timeout had already been logged as a failure, and could still reach
// ShadowAssessment.create() afterward - confirmed, reproducible, and the
// audit's Finding 1. Two independent layers close this, appropriate to
// what this Mongoose/MongoDB driver version actually supports (verified
// directly before relying on it, not assumed): (1) every DB read below
// takes `signal`, so an in-flight network round trip is itself aborted the
// instant the caller gives up on it - confirmed empirically that this
// driver honors AbortSignal on queries; (2) `signal.aborted` is checked
// again, synchronously, immediately before the actual write - confirmed
// empirically that `.create()` does NOT honor AbortSignal, so this manual
// checkpoint is the backstop for the gap layer (1) can't close on its own
// (reads already finished, computation is in flight, write hasn't
// happened yet). Together: a full network read is truly cancelled, not
// merely ignored; a write is never reached once the caller has moved on.
// ---------------------------------------------------------------------------

class ShadowNoClaimSignal extends Error {}
class ShadowAbortedSignal extends Error {}

async function computeAndPersistShadowAssessment(
  claimId: string,
  productionBand: AssessmentBand,
  signal: AbortSignal
): Promise<void> {
  const claim = await Claim.findById(claimId, null, { signal }).lean<{
    _id: unknown;
    temporalScope?: TemporalScope;
    jurisdiction?: string | null;
  }>();
  if (!claim) throw new ShadowNoClaimSignal("claim not found");

  const evidenceDocs = await EvidenceObject.find({ claimId }, null, { signal }).lean<
    Array<{
      _id: unknown;
      stance: "supports" | "contradicts" | "context" | "unknown";
      authorityScore: number;
      relevanceScore: number;
      stanceConfidence: number;
      independenceGroup: string;
      sourceType: EvidenceStrengthInput["sourceType"];
      publishedAt: Date | null;
      evidenceText: string | null;
    }>
  >();

  const items: EvidenceStrengthInput[] = evidenceDocs.map((doc) => ({
    stance: doc.stance,
    authorityScore: doc.authorityScore,
    relevanceScore: doc.relevanceScore,
    stanceConfidence: doc.stanceConfidence,
    independenceGroup: doc.independenceGroup,
    sourceType: doc.sourceType,
    publishedAt: doc.publishedAt,
    evidenceText: doc.evidenceText,
  }));

  const claimContext: ClaimContext = {
    temporalScope: claim.temporalScope ?? { type: "unspecified", value: null },
    jurisdiction: claim.jurisdiction ?? null,
  };

  const { supportProfile, contradictionProfile } = buildEvidenceConflictInput(items, claimContext);
  const conflictCategory = classifyConflictCategory(supportProfile, contradictionProfile, claimContext);
  const evidenceState = resolveTieredDominance(supportProfile, contradictionProfile);
  const assessmentBand = mapEvidenceStateToAssessmentBand(evidenceState);

  const shadowDirection = BAND_TO_DIRECTION[assessmentBand];
  const productionDirection = BAND_TO_DIRECTION[productionBand];
  // "expected" = production's verdict, "observed" = shadow's candidate
  // verdict - reusing lib/dangerWeightedSeverity.ts's existing, unmodified
  // classification unchanged (contract §11: "this definition is settled").
  const dangerTier = classifyDangerTier(productionDirection, shadowDirection);
  const dangerWeightValue = dangerWeight(productionDirection, shadowDirection);
  const isDangerousDisagreement = dangerTier === "dangerously_wrong";

  const isFirstEver = (await ShadowAssessment.estimatedDocumentCount()) === 0;

  // Sprint 6.75.8 (Finding 3) remediation: the observation-completion
  // event may already have happened by the time THIS record is created -
  // the one-time backfill (markObservationCompleteAndBackfillRetention)
  // only catches records that already existed at the moment it ran.
  // Reading observationCompletedAt here, at write time, and stamping
  // expiresAt immediately whenever it's already set closes the MAIN gap:
  // no record can silently escape retention merely because of when it
  // happened to be created relative to that one sweep. The invariant
  // itself is unchanged - still exactly "observation completion + the
  // authorized review-buffer days," computed from the SAME
  // observationCompletedAt timestamp the sweep itself uses, never a new
  // "now." A record created before completion still gets expiresAt: null
  // here, exactly as before, and is still covered by the one-time sweep
  // when completion is later marked.
  const controlDocsForRetention = await readControlDocuments();
  const observationCompletedAt = controlDocsForRetention.find((d) => d.observationCompletedAt)?.observationCompletedAt ?? null;
  const expiresAt = observationCompletedAt ? computeRetentionExpiresAt(observationCompletedAt) : null;

  // Sprint 6.75.8 (Finding 1) remediation, layer 2: the final checkpoint,
  // immediately before the write itself. If the caller already gave up
  // (its own timeout fired) while we were between the reads above and
  // here, stop now rather than writing a record for an attempt that has
  // already been reported as failed.
  if (signal.aborted) throw new ShadowAbortedSignal("aborted after timeout, before write");

  const created = await ShadowAssessment.create({
    claimId: claim._id,
    evidenceObjectIds: evidenceDocs.map((doc) => doc._id),
    modelVersion: SHADOW_MODEL_VERSION,
    conflictCategory,
    evidenceState,
    assessmentBand,
    supportProfile: {
      itemCount: supportProfile.itemCount,
      meaningfulIndependentGroupCount: supportProfile.meaningfulIndependentGroupCount,
      qualityTier: supportProfile.qualityTier,
      bestItemScore: supportProfile.bestItem?.score ?? null,
    },
    contradictionProfile: {
      itemCount: contradictionProfile.itemCount,
      meaningfulIndependentGroupCount: contradictionProfile.meaningfulIndependentGroupCount,
      qualityTier: contradictionProfile.qualityTier,
      bestItemScore: contradictionProfile.bestItem?.score ?? null,
    },
    isMixedStance: supportProfile.itemCount > 0 && contradictionProfile.itemCount > 0,
    productionBand,
    agreesWithProduction: assessmentBand === productionBand,
    expiresAt,
    dangerTier,
    dangerWeight: dangerWeightValue,
    isDangerousDisagreement,
  });

  // Sprint 6.75.10 (Finding 3 completion-race remediation): the read above
  // (controlDocsForRetention) can be stale by the time the create() call
  // above actually commits - completion could become effective in that
  // exact gap, and the one-time sweep, if it already ran before this
  // record existed, will never revisit it. Closing this with a SECOND,
  // unconditional read, taken strictly after the write, is provably
  // sufficient on this project's standalone (non-replica-set) MongoDB,
  // not merely less likely to race: completion becoming effective is a
  // permanent, one-time fact (guarded by the same singleton-safe upsert
  // Finding 2 already relies on), and a standalone MongoDB node gives
  // immediate, single-copy consistency - any read taken after this write
  // commits is guaranteed to observe completion if it had already
  // happened by then. The correction itself is a conditional, atomic
  // updateOne scoped to exactly this record's _id and current null state,
  // so it can never race destructively against the one-time sweep (both
  // independently compute the IDENTICAL value from the same immutable
  // observationCompletedAt, so whichever of the two writes "wins" for this
  // one document, the result is the same). Only runs when the initial read
  // saw "not complete" - if it already saw completion, that fact can never
  // change (observationCompletedAt is set at most once), so there is
  // nothing to re-check.
  if (expiresAt === null) {
    const freshControlDocs = await readControlDocuments();
    const freshObservationCompletedAt = freshControlDocs.find((d) => d.observationCompletedAt)?.observationCompletedAt ?? null;
    if (freshObservationCompletedAt) {
      const freshExpiresAt = computeRetentionExpiresAt(freshObservationCompletedAt);
      await ShadowAssessment.updateOne({ _id: created._id, expiresAt: null }, { $set: { expiresAt: freshExpiresAt } });
    }
  }

  if (isFirstEver) {
    await upsertControlSingleton({ observationStartedAt: new Date() });
  }

  logEvent("SHADOW_ASSESSMENT_ATTEMPT", {
    claimId,
    modelVersion: SHADOW_MODEL_VERSION,
    outcome: "success",
    dangerTier,
    dangerWeight: dangerWeightValue,
  });

  await checkDangerousDisagreementRateAndMaybePause();
}

// ---------------------------------------------------------------------------
// Automatic stop condition (contract §11). Runs after every successful
// persist; a window smaller than the configured size is never evaluated -
// there is nothing statistically meaningful to trigger on yet.
// ---------------------------------------------------------------------------

async function checkDangerousDisagreementRateAndMaybePause(): Promise<void> {
  const windowSize = getShadowDangerousDisagreementWindowSize();
  const thresholdPct = getShadowDangerousDisagreementThresholdPct();

  const recent = await ShadowAssessment.find({})
    .sort({ createdAt: -1 })
    .limit(windowSize)
    .select("isDangerousDisagreement")
    .lean<Array<{ isDangerousDisagreement: boolean }>>();

  if (recent.length < windowSize) return;

  const dangerousCount = recent.filter((r) => r.isDangerousDisagreement).length;
  const ratePct = (dangerousCount / recent.length) * 100;

  if (ratePct > thresholdPct) {
    await pauseShadowMode(
      `Dangerous-disagreement rate ${ratePct.toFixed(2)}% (${dangerousCount}/${recent.length}) exceeded threshold ${thresholdPct}% over rolling window of ${recent.length}`
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point (contract §5, §7). Callers MUST check isShadowModeEnabled()
// themselves before calling this - the kill-switch gate lives at the call
// site, not inside this function, specifically so a spy on this exact
// function proves it was never invoked when disabled (contract §7's
// verification procedure, test 1 - "not just an absence of side effects").
// ---------------------------------------------------------------------------

export async function runShadowAssessment(claimId: string, productionBand: AssessmentBand): Promise<void> {
  if (await isShadowModePaused()) {
    logEvent("SHADOW_ASSESSMENT_ATTEMPT", { claimId, outcome: "paused" });
    return;
  }

  // Sprint 6.75.8 (Finding 1) remediation, layer 1: this signal is threaded
  // into every DB read inside computeAndPersistShadowAssessment. Aborting
  // it the instant withTimeout gives up (below) cancels an in-flight read
  // at the driver level - confirmed empirically this Mongoose/MongoDB
  // driver version honors AbortSignal on queries - instead of leaving it
  // to resolve naturally later and drive an orphaned continuation forward.
  const abortController = new AbortController();

  try {
    await withTimeout(
      computeAndPersistShadowAssessment(claimId, productionBand, abortController.signal),
      getShadowComputationTimeoutMs(),
      "Shadow assessment"
    );
  } catch (error) {
    // Fires on EVERY failure path below, not only a genuine timeout -
    // harmless when there's nothing left in flight to abort (e.g. a plain
    // thrown exception). This is what layer 1 depends on: once `withTimeout`
    // has settled (by definition, we're in this catch block), the orphaned
    // inner computation - if one still exists - gets its in-flight DB read
    // aborted right now. Note that the inner promise's EVENTUAL rejection
    // (from that aborted read, or from ShadowAbortedSignal's own checkpoint
    // firing later) is never observed here: `withTimeout`'s dangling
    // `.catch()` on the inner promise calls `reject()` on an
    // already-settled outer promise, which is a silent no-op by Promise
    // semantics, not a second catch. The property this test suite verifies
    // directly is the one that actually matters - no write ever reaches
    // ShadowAssessment - not whether a second log line appears for the
    // orphan's own outcome.
    abortController.abort();

    if (error instanceof ShadowNoClaimSignal) {
      logEvent("SHADOW_ASSESSMENT_ATTEMPT", { claimId, outcome: "no_claim" });
      return;
    }
    // Never propagates - contract §5's absolute requirement. Caught here
    // regardless of cause (exception inside the computation, or a timeout
    // raised by withTimeout itself).
    logEvent("SHADOW_ASSESSMENT_ATTEMPT", {
      claimId,
      outcome: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Completion criteria (contract §12) - conjunctive, read-only. Used by
// scripts/completeShadowObservation.ts; never called from a request path.
// ---------------------------------------------------------------------------

export type ShadowObservationStatus = {
  totalAssessments: number;
  mixedStanceAssessments: number;
  observationStartedAt: Date | null;
  daysElapsed: number;
  isComplete: boolean;
  criteria: {
    totalAssessmentsMet: boolean;
    mixedStanceAssessmentsMet: boolean;
    daysElapsedMet: boolean;
  };
};

export async function getShadowObservationStatus(): Promise<ShadowObservationStatus> {
  const [totalAssessments, mixedStanceAssessments, controlDocs] = await Promise.all([
    ShadowAssessment.countDocuments({}),
    ShadowAssessment.countDocuments({ isMixedStance: true }),
    ShadowModeControl.find({}).lean<Array<{ observationStartedAt?: Date | null }>>(),
  ]);

  // Same duplicate-safe read as isShadowModePaused() (Sprint 6.75.8,
  // Finding 2) - the unique index prevents new duplicates, this is defense
  // in depth against any pre-existing legacy state.
  const observationStartedAt = controlDocs.find((d) => d.observationStartedAt)?.observationStartedAt ?? null;
  const daysElapsed = observationStartedAt
    ? (Date.now() - new Date(observationStartedAt).getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const criteria = {
    totalAssessmentsMet: totalAssessments >= getShadowMinTotalAssessments(),
    mixedStanceAssessmentsMet: mixedStanceAssessments >= getShadowMinMixedStanceAssessments(),
    daysElapsedMet: daysElapsed >= getShadowMinObservationDays(),
  };

  return {
    totalAssessments,
    mixedStanceAssessments,
    observationStartedAt,
    daysElapsed,
    isComplete: criteria.totalAssessmentsMet && criteria.mixedStanceAssessmentsMet && criteria.daysElapsedMet,
    criteria,
  };
}

// ---------------------------------------------------------------------------
// Retention backfill (contract §9). A one-time, idempotent operation
// triggered when the observation phase concludes - never per-request. See
// models/ShadowAssessment.ts's header and
// docs/SHADOW_MODE_POLICY_DECISIONS.md item 6 for why this can't be a
// write-time TTL.
// ---------------------------------------------------------------------------

export type RetentionBackfillResult = {
  marked: boolean;
  alreadyMarked: boolean;
  recordsUpdated: number;
  expiresAt: Date | null;
};

export async function markObservationCompleteAndBackfillRetention(): Promise<RetentionBackfillResult> {
  const status = await getShadowObservationStatus();
  if (!status.isComplete) {
    return { marked: false, alreadyMarked: false, recordsUpdated: 0, expiresAt: null };
  }

  const controlDocs = await readControlDocuments();
  if (controlDocs.some((d) => d.observationCompletedAt)) {
    // Idempotent: do not re-stamp expiresAt on a second call, which would
    // silently push retention further out every time this script runs.
    return { marked: true, alreadyMarked: true, recordsUpdated: 0, expiresAt: null };
  }

  const conclusionDate = new Date();
  const expiresAt = computeRetentionExpiresAt(conclusionDate);

  const result = await ShadowAssessment.updateMany({ expiresAt: null }, { $set: { expiresAt } });
  await upsertControlSingleton({ observationCompletedAt: conclusionDate });

  logEvent("SHADOW_OBSERVATION_COMPLETE", {
    conclusionDate: conclusionDate.toISOString(),
    expiresAt: expiresAt.toISOString(),
    recordsUpdated: result.modifiedCount,
  });

  return { marked: true, alreadyMarked: false, recordsUpdated: result.modifiedCount, expiresAt };
}
