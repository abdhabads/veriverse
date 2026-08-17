import TrustEvent from "@/models/TrustEvent";

export type TrustEventType =
  | "community_finalize_verified"
  | "community_finalize_false"
  | "community_finalize_disputed"
  | "expert_finalize_verified"
  | "expert_finalize_false"
  | "expert_finalize_disputed"
  | "appeal_approved_reopen"
  | "contradiction_forced"
  | "appeal_rejected"
  | "edit_reopen";

export function buildTrustEventKey(params: {
  postId: string;
  trustDecisionVersion: number;
  eventType: TrustEventType;
}) {
  return `post:${params.postId}:v${params.trustDecisionVersion}:${params.eventType}`;
}

export async function hasTrustEvent(eventKey: string) {
  const existing = await TrustEvent.findOne({ eventKey }).select("_id");
  return Boolean(existing);
}

export async function recordTrustEvent(params: {
  postId: string;
  trustDecisionVersion: number;
  eventType: TrustEventType;
  metadata?: Record<string, unknown>;
}) {
  const eventKey = buildTrustEventKey({
    postId: params.postId,
    trustDecisionVersion: params.trustDecisionVersion,
    eventType: params.eventType,
  });

  const existing = await TrustEvent.findOne({ eventKey });
  if (existing) {
    return {
      created: false,
      event: existing,
      eventKey,
    };
  }

  const event = await TrustEvent.create({
    post: params.postId,
    eventKey,
    eventType: params.eventType,
    trustDecisionVersion: params.trustDecisionVersion,
    applied: true,
    metadata: params.metadata || {},
  });

  return {
    created: true,
    event,
    eventKey,
  };
}
