export type FinalTrustOutcome = "verified" | "false" | "disputed";

export type TrustEvaluationResult = {
  finalStatus: FinalTrustOutcome;
  reason: string;
  source: "community" | "expert";
  shouldFinalize: boolean;
  metadata?: Record<string, unknown>;
};
