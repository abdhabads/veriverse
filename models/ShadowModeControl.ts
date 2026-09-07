import { Schema, model, models } from "mongoose";

// A single-document collection holding shadow mode's runtime state - state
// that must survive across requests and process restarts, which the
// SHADOW_MODE_ENABLED env var alone cannot represent.
//
// This collection is NOT named anywhere in docs/SHADOW_MODE_CONTRACT.md by
// this exact name - it exists because contract §11 requires an automatic
// pause that persists "until a human reviews" it (not merely for the
// current process), and §9/§12 require tracking when the observation phase
// started and concluded so the retention backfill has a real date to use.
// An env var can flip behavior for the current process only; it cannot
// record "a human has not yet reviewed this pause" across a redeploy. This
// is real, necessary implementation surface beyond the contract's literal
// text, called out explicitly rather than added silently.
//
// Carries no post/user/claim reference - it is not shadow-mode OUTPUT data
// (contract §2/§3 govern that; see models/ShadowAssessment.ts), it is
// operational control state, closer in kind to the existing AI_ENABLED
// pattern than to any persisted assessment.
// Sprint 6.75.8 (Shadow Mode Safety Remediation), Finding 2: a fixed,
// unique value every document in this collection must carry - the
// database-enforced form of "there is exactly one." The pre-remediation
// design relied on application code always upserting with an empty filter
// against what was assumed to be a single document; a real, reproducible
// audit finding showed concurrent first-ever upserts can both insert
// before either sees the other, producing two documents with nothing
// stopping it. A unique index on this field makes that literally
// impossible at the database layer: a second insert attempt fails with a
// duplicate-key error instead of succeeding - see lib/shadowMode.ts's
// upsertControlSingleton for how callers handle that error (retry as a
// plain update against the document that won).
export const SHADOW_MODE_CONTROL_SINGLETON_KEY = "singleton";

const ShadowModeControlSchema = new Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: SHADOW_MODE_CONTROL_SINGLETON_KEY,
    },

    pausedForDangerousDisagreement: { type: Boolean, default: false },
    pausedAt: { type: Date, default: null },
    pausedReason: { type: String, default: null },

    // Set once, on the first successful ShadowAssessment ever persisted -
    // the start of the observation window contract §12 measures duration
    // against.
    observationStartedAt: { type: Date, default: null },
    // Set once, by the operator-run completion script
    // (scripts/completeShadowObservation.ts), when §12's conjunctive
    // criteria are all met. Triggers the §9 retention backfill exactly
    // once - see lib/shadowMode.ts's markObservationCompleteAndBackfillRetention.
    observationCompletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default models.ShadowModeControl || model("ShadowModeControl", ShadowModeControlSchema);
