// lib/claimChangeNotification.ts
//
// P3.4: pure classification/copy generation for Claim-change notifications,
// plus the one orchestration function that ties event persistence to
// follower fanout. This file computes no trust and reuses the existing
// P3.1 presentation layer for wording - it never invents a new verdict
// interpretation.
import ClaimChangeEvent from "@/models/ClaimChangeEvent";
import ClaimFollow from "@/models/ClaimFollow";
import Notification from "@/models/Notification";
import { getClaimAssessmentPresentation, type TrustAssessmentBand } from "@/lib/claimPresentation";
import { logEvent } from "@/lib/logger";

export type ClaimChangeType = "initial_assessment" | "band_changed" | "evidence_shifted_same_band";

export type ClaimChangeClassificationInput = {
  isInitialAssessment: boolean;
  // null when there is no comparable previous assessment (e.g. the exact
  // N-1 row is missing) - classification then fails safe rather than
  // guessing, per the audit's explicit instruction.
  previousBand: TrustAssessmentBand | null;
  currentBand: TrustAssessmentBand;
  previousCounts: { supportingCount: number; contradictingCount: number } | null;
  currentCounts: { supportingCount: number; contradictingCount: number };
};

// Deterministic - no date guessing, no confidence comparison, no
// unresolved/context evidence involved. Returns null when nothing
// user-meaningful happened (same band, no zero-crossing, or a missing
// previous assessment that can't be safely compared).
export function classifyClaimChange(input: ClaimChangeClassificationInput): ClaimChangeType | null {
  if (input.isInitialAssessment) return "initial_assessment";

  if (input.previousBand === null) return null;

  if (input.previousBand !== input.currentBand) return "band_changed";

  if (!input.previousCounts) return null;

  const supportCrossed =
    (input.previousCounts.supportingCount === 0) !== (input.currentCounts.supportingCount === 0);
  const contradictCrossed =
    (input.previousCounts.contradictingCount === 0) !== (input.currentCounts.contradictingCount === 0);

  if (supportCrossed || contradictCrossed) return "evidence_shifted_same_band";

  return null;
}

// Deterministic, templated - never AI-generated, never raw band strings,
// never "TRUE"/"FALSE"/"AI determined". Reuses the exact same presentation
// labels already shown on the Claim page.
export function getClaimChangeMessage(changeType: ClaimChangeType, toAssessmentBand: string): string {
  const { label } = getClaimAssessmentPresentation(toAssessmentBand);
  switch (changeType) {
    case "initial_assessment":
      return `A claim you follow now has an assessment: ${label}.`;
    case "band_changed":
      return `A claim you follow is now ${label}.`;
    case "evidence_shifted_same_band":
      return "New evidence changed the assessment of a claim you follow.";
  }
}

type RecordParams = {
  claimId: string;
  fromAssessmentVersion: number | null;
  toAssessmentVersion: number;
  changeType: ClaimChangeType;
  fromAssessmentBand: TrustAssessmentBand | null;
  toAssessmentBand: TrustAssessmentBand;
};

// The event is a durable idempotency ANCHOR, not a fanout-completion flag:
// its existence records "this transition happened, exactly once." It does
// NOT record whether notification delivery for it has finished. Fanout is
// therefore always attempted below, whether this call created the event or
// a concurrent/earlier run already did - a prior partial delivery failure
// (some followers notified, others missed) can self-repair on a later
// retry, because Notification's own unique partial index (not event
// novelty) is what actually prevents duplicate delivery.
//
// Never throws - every failure is caught and logged. This is called from
// inside the truth pipeline's best-effort side-observer block (matching
// Shadow Mode's own precedent) and must never affect Claim assessment
// success.
export async function recordClaimChangeAndNotify(params: RecordParams): Promise<void> {
  const {
    claimId,
    fromAssessmentVersion,
    toAssessmentVersion,
    changeType,
    fromAssessmentBand,
    toAssessmentBand,
  } = params;

  try {
    let event;
    try {
      event = await ClaimChangeEvent.create({
        claim: claimId,
        fromAssessmentVersion,
        toAssessmentVersion,
        changeType,
        fromAssessmentBand,
        toAssessmentBand,
      });
    } catch (error: unknown) {
      if ((error as { code?: number })?.code === 11000) {
        event = await ClaimChangeEvent.findOne({ claim: claimId, toAssessmentVersion });
      } else {
        throw error;
      }
    }
    if (!event) return;

    const followers = await ClaimFollow.find({ claim: claimId }).select("user");
    if (followers.length === 0) return;

    const message = getClaimChangeMessage(changeType, toAssessmentBand);
    const docs = followers.map((follow) => ({
      user: follow.user,
      type: "claim_updated",
      message,
      referenceClaim: claimId,
      referenceClaimChangeEvent: event._id,
    }));

    try {
      await Notification.insertMany(docs, { ordered: false });
    } catch (error: unknown) {
      // insertMany({ordered:false}) throws when ANY document fails, even if
      // most succeeded (the successful ones are still persisted). A retry
      // of fanout against already-delivered follower/event pairs produces
      // exactly this shape - duplicate-key failures only - which is the
      // expected, benign outcome of self-repair, not a real error. Anything
      // else is logged; it must never affect the Claim assessment.
      const writeErrors = (error as { writeErrors?: Array<{ code?: number; err?: { code?: number } }> })
        ?.writeErrors;
      const allDuplicates =
        Array.isArray(writeErrors) &&
        writeErrors.length > 0 &&
        writeErrors.every((writeError) => (writeError.err?.code ?? writeError.code) === 11000);

      if (!allDuplicates) {
        logEvent("CLAIM_CHANGE_NOTIFICATION_FANOUT_FAILED", {
          claimId,
          toAssessmentVersion,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error: unknown) {
    logEvent("CLAIM_CHANGE_EVENT_FAILED", {
      claimId,
      toAssessmentVersion,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
