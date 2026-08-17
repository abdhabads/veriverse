import {
  TrustEventType,
  buildTrustEventKey,
  hasTrustEvent,
  recordTrustEvent,
} from "@/lib/trustEvents";

export async function ensureTrustSettlementOnce(params: {
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

  const alreadyApplied = await hasTrustEvent(eventKey);

  if (alreadyApplied) {
    return {
      shouldApply: false,
      eventKey,
    };
  }

  const result = await recordTrustEvent({
    postId: params.postId,
    trustDecisionVersion: params.trustDecisionVersion,
    eventType: params.eventType,
    metadata: params.metadata,
  });

  return {
    shouldApply: result.created,
    eventKey,
  };
}
