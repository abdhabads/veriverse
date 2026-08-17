/**
 * Truncates text at the last complete sentence boundary before maxChars.
 * Falls back to last word boundary if no sentence end is found.
 */
export function truncateAtSentence(text: string, maxChars: number = 600): string {
  if (!text || text.length <= maxChars) return text;

  const segment = text.slice(0, maxChars);
  const lastPeriod = segment.lastIndexOf(".");
  const lastQuestion = segment.lastIndexOf("?");
  const lastExclaim = segment.lastIndexOf("!");
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (lastSentenceEnd > maxChars * 0.4) {
    return segment.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = segment.lastIndexOf(" ");
  return lastSpace > 0 ? `${segment.slice(0, lastSpace).trim()}...` : segment.trim();
}