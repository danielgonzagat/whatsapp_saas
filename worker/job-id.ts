function sanitizeQueueIdPart(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return normalized || "na";
}

export function buildQueueJobId(prefix: string, ...parts: unknown[]): string {
  return [sanitizeQueueIdPart(prefix), ...parts.map(sanitizeQueueIdPart)].join("__");
}

export function buildQueueDedupId(prefix: string, ...parts: unknown[]): string {
  return buildQueueJobId(prefix, ...parts);
}
