export function formatVerificationScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) {
    return "—";
  }
  return `${Math.round(score * 100)}%`;
}
