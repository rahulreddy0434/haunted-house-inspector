export function formatConfidence(confidence: number): string {
  return `~${Math.round(confidence * 100)}%`;
}
