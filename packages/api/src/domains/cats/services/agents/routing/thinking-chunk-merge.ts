export function appendThinkingChunk(existing: string, chunk: string): string {
  if (!existing) return chunk;
  if (!chunk) return existing;
  return `${existing}${chunk}`;
}
