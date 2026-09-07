import { Schema, model, models } from "mongoose";

// Temporary, narrowly-scoped checkpoint for the one-time historical Claim-
// resolution backfill (the 32 pre-2957b78 production posts with
// Post.claimId: null). NOT part of the permanent trust-engine schema - safe
// to drop once the backfill is complete and verified.
//
// This is the authoritative per-post recovery state, not Post.claimId and
// not Claim/TrustAssessment. Design review established both are
// insufficient on their own:
//   - Post.claimId: null is true both for "never touched" and "partially
//     processed then crashed" - it cannot distinguish the two.
//   - Claim/TrustAssessment state is SHARED across every post that resolves
//     to the same claim (proven: two of the 32 historical posts converge on
//     one claim), so neither can serve as a per-post completion predicate -
//     nothing on TrustAssessment ties a specific version back to the post
//     whose backfill run caused it.
const BackfillStageValues = [
  "pending",
  "classified",
  "claim_resolved",
  "evidence_completed",
  "version_reserved",
  "assessment_completed",
  "post_linked",
] as const;
export type BackfillStage = (typeof BackfillStageValues)[number];

const HistoricalClaimBackfillCheckpointSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      unique: true,
    },

    // Monotonic - only ever advances forward through BackfillStageValues.
    // Failures never move this backward; they're recorded separately below
    // alongside whatever stage was last durably reached.
    stage: {
      type: String,
      enum: BackfillStageValues,
      default: "pending",
      required: true,
    },

    // --- classification (stage: classified) ---
    eligibility: {
      type: String,
      enum: ["eligible_claim", "skip_question", "skip_instruction", "needs_manual_review"],
      default: null,
    },
    // "stored": reused the contentType already persisted on the Post at the
    // time it was created. "live_reclassification": no stored contentType
    // existed, so the current classifier was called fresh (reproducing
    // evaluateContentTruthPipeline's exact withTimeout/withRetry/fail-open
    // wrapping around screenContentWithAI, not a bare call to it) - these
    // posts are always eligibility: needs_manual_review regardless of what
    // the classifier returns.
    classificationSource: {
      type: String,
      enum: ["stored", "live_reclassification"],
      default: null,
    },
    classifiedContentType: { type: String, default: null },
    classifiedExtractedClaim: { type: String, default: null },

    // --- claim resolution (stage: claim_resolved) ---
    claimId: { type: Schema.Types.ObjectId, ref: "Claim", default: null },
    claimWasNewlyCreated: { type: Boolean, default: null },

    // --- evidence (stage: evidence_completed) ---
    // Once this stage is reached, the backfill script must never re-run
    // grounding for this post again on any subsequent resume.
    contentHash: { type: String, default: null },
    evidenceObjectIds: { type: [Schema.Types.ObjectId], ref: "EvidenceObject", default: [] },
    // The EvidenceObject ids that existed for this claim BEFORE this run's
    // own persistence - captured at evidence time so a later resume can
    // reconstruct the correct "prior evidence" set for
    // advanceClaimAssessmentVersion's snapshot argument, even though by then
    // getExistingEvidenceForClaim(claimId) would also return this run's own
    // (already-persisted) evidence and could no longer distinguish the two.
    priorEvidenceObjectIds: { type: [Schema.Types.ObjectId], ref: "EvidenceObject", default: [] },
    newEvidenceCreatedThisRun: { type: Boolean, default: null },

    // --- assessment-version reservation (stage: version_reserved) ---
    // preAdvanceVersion: Claim.currentAssessmentVersion observed immediately
    // after evidence persistence, captured BEFORE this run attempts any
    // version advance. On resume, comparing the claim's live current version
    // against this snapshot is what lets the script tell "my own advance
    // already happened" apart from "concurrent live activity advanced it
    // instead" without trusting an in-memory flag a crash could have lost -
    // see the backfill design review's concurrency analysis.
    preAdvanceVersion: { type: Number, default: null },
    // The exact version this run's TrustAssessment must be pinned to. Once
    // set, always used verbatim - never re-derived from
    // Claim.currentAssessmentVersion again, even if later, unrelated
    // activity advances the claim further.
    reservedAssessmentVersion: { type: Number, default: null },

    // --- assessment (stage: assessment_completed) ---
    trustAssessmentId: { type: Schema.Types.ObjectId, ref: "TrustAssessment", default: null },

    // --- final link (stage: post_linked) ---
    postLinkedAt: { type: Date, default: null },

    // --- failure/attempt metadata, independent of stage ---
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    lastError: {
      message: { type: String, default: null },
      stage: { type: String, default: null },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default models.HistoricalClaimBackfillCheckpoint ||
  model("HistoricalClaimBackfillCheckpoint", HistoricalClaimBackfillCheckpointSchema);
