const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9_-]+/g;
const PATTERN_RE = /^_+|_+$/g;
function sanitizeQueueIdPart(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(A_Z_A_Z0_9_RE, '_')
    .replace(PATTERN_RE, '')
    .slice(0, 80);

  return normalized || 'na';
}

/** Build queue job id. */
export function buildQueueJobId(prefix: string, ...parts: unknown[]): string {
  return [sanitizeQueueIdPart(prefix), ...parts.map(sanitizeQueueIdPart)].join('__');
}

/** Build queue dedup id. */
export function buildQueueDedupId(prefix: string, ...parts: unknown[]): string {
  return buildQueueJobId(prefix, ...parts);
}
