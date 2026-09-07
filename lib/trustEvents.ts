import { ClientSession } from "mongoose";
import TrustEvent from "@/models/TrustEvent";

export type TrustEventType =
  | "community_finalize_verified"
  | "community_finalize_false"
  | "community_finalize_disputed"
  | "expert_finalize_verified"
  | "expert_finalize_false"
  | "expert_finalize_disputed"
  | "appeal_approved_reopen"
  | "appeal_settlement_reversed"
  | "contradiction_forced"
  | "evidence_deescalated"
  | "content_classified_non_claim"
  | "appeal_rejected"
  | "edit_reopen";

export function buildTrustEventKey(params: {
  postId: string;
  trustDecisionVersion: number;
  eventType: TrustEventType;
}) {
  return `post:${params.postId}:v${params.trustDecisionVersion}:${params.eventType}`;
}

// Restored for lib/trustSettlementGuard.ts, which still calls this directly -
// that file is outside this reconciliation's scope and was intentionally left
// untouched, so this stays available for it exactly as it always was.
export async function hasTrustEvent(eventKey: string) {
  const existing = await TrustEvent.findOne({ eventKey }).select("_id");
  return Boolean(existing);
}

type ReserveTrustEventParams = {
  postId: string;
  trustDecisionVersion: number;
  eventType: TrustEventType;
  metadata?: Record<string, unknown>;
  applied?: boolean;
  session?: ClientSession | null;
};

// Atomically creates the event row (the unique index on eventKey is the source of
// truth for "has this exact event happened before"), instead of the previous
// find-then-create pattern, which left a race window between the two steps.
// A concurrent/duplicate reservation loses the create() and is told about the
// row the winner created via the duplicate-key catch, rather than racing on a
// separate read.
export async function reserveTrustEvent(params: ReserveTrustEventParams) {
  const eventKey = buildTrustEventKey(params);

  try {
    const [event] = await TrustEvent.create(
      [
        {
          post: params.postId,
          eventKey,
          eventType: params.eventType,
          trustDecisionVersion: params.trustDecisionVersion,
          applied: params.applied ?? true,
          metadata: params.metadata || {},
        },
      ],
      { session: params.session ?? undefined }
    );

    return { reserved: true, alreadyApplied: false, event, eventKey };
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      const existing = await TrustEvent.findOne({ eventKey }).session(
        params.session ?? null
      );
      return {
        reserved: false,
        alreadyApplied: Boolean(existing?.applied),
        event: existing,
        eventKey,
      };
    }
    throw err;
  }
}

export async function markTrustEventApplied(
  eventKey: string,
  session?: ClientSession | null
) {
  await TrustEvent.updateOne(
    { eventKey },
    { $set: { applied: true } },
    { session: session ?? undefined }
  );
}

// For narrative-only events with no separate "consequences" step (edit_reopen,
// appeal_rejected, content_classified_non_claim, ...): applied immediately, and
// idempotent the same way reserveTrustEvent is.
export async function recordTrustEvent(params: {
  postId: string;
  trustDecisionVersion: number;
  eventType: TrustEventType;
  metadata?: Record<string, unknown>;
  session?: ClientSession | null;
}) {
  const result = await reserveTrustEvent({ ...params, applied: true });
  return {
    created: result.reserved,
    event: result.event,
    eventKey: result.eventKey,
  };
}
