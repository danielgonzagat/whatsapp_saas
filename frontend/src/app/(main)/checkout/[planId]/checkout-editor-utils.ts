const A_Z0_9_RE = /[^A-Z0-9]/g;

export function normalizeCheckoutCode(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(A_Z0_9_RE, '')
    .slice(0, 8);
}
