import { Schema, model, models } from "mongoose";

// P3.4: a durable record that a Claim's authoritative assessment genuinely
// changed in a user-meaningful way - distinct from and unrelated to
// models/TrustEvent.ts (a Post-scoped settlement/finalization audit log for
// the parked reputation/reward subsystem). This model observes the
// already-produced result of buildAndPersistTrustAssessment(); it never
// computes trust, never touches evidence scoring, and stores no duplicated
// assessment payload (no evidence arrays, no reasons, no confidence
// internals, no provider/model metadata) - only what's needed to identify
// the transition and drive deterministic notification copy.
//
// This is an idempotency ANCHOR, not a fanout completion flag: its own
// existence records "this transition happened, exactly once" - it does not
// record or imply that notification delivery for it has finished. Fanout
// may be safely re-attempted against an already-existing event (see
// lib/claimChangeNotification.ts) to repair a prior partial delivery
// failure, without ever creating a second event for the same transition.
const ClaimChangeEventSchema = new Schema(
  {
    claim: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
      index: true,
    },
    // null only for changeType "initial_assessment" - there is no prior
    // version for a claim's first assessment.
    fromAssessmentVersion: {
      type: Number,
      default: null,
    },
    toAssessmentVersion: {
      type: Number,
      required: true,
    },
    changeType: {
      type: String,
      enum: ["initial_assessment", "band_changed", "evidence_shifted_same_band"],
      required: true,
    },
    // null only for changeType "initial_assessment".
    fromAssessmentBand: {
      type: String,
      enum: [
        "well_supported",
        "weakly_supported",
        "contested",
        "contradicted",
        "insufficient_evidence",
      ],
      default: null,
    },
    toAssessmentBand: {
      type: String,
      enum: [
        "well_supported",
        "weakly_supported",
        "contested",
        "contradicted",
        "insufficient_evidence",
      ],
      required: true,
    },
  },
  { timestamps: true }
);

// A claim can only ever transition INTO a given version once (versions
// strictly increment one at a time) - toAssessmentVersion alone already
// uniquely identifies the transition per claim, so this is the complete
// idempotency guarantee; no additional index is added for hypothetical
// future history/analytics reads.
ClaimChangeEventSchema.index({ claim: 1, toAssessmentVersion: 1 }, { unique: true });

export default models.ClaimChangeEvent || model("ClaimChangeEvent", ClaimChangeEventSchema);
