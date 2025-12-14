export function getSafeCallbackUrl(
  raw: string | null | undefined,
  fallback: string = "/"
): string {
  if (!raw) return fallback;

  // Only allow same-origin relative paths.
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;

  return raw;
}
