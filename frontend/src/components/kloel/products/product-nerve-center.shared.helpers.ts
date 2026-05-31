/**
 * Pure helpers extracted from product-nerve-center.shared.tsx.
 *
 * These helpers contain no React state, no DOM access, and no side effects,
 * so they can be unit-tested in isolation. The shared component file
 * re-exports them to preserve the public surface used by sibling tabs.
 */

/** Recursive JSON-safe value — keeps the runtime model honest without `any`. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Record-shaped JSON value, the common payload shape from the API envelope. */
export type JsonRecord = { [key: string]: JsonValue };

/**
 * Safely coerces an unknown value to a string for JSX `value` props.
 *
 * - `null` / `undefined` → empty string (keeps inputs controlled).
 * - everything else → `String(value)`.
 */
export function jv(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

/**
 * Safely coerces an unknown value to a finite number for numeric inputs.
 *
 * Falsy / NaN / non-coercible → `0`. Never throws.
 */
export function jn(value: unknown): number {
  return Number(value) || 0;
}

/**
 * Unwraps the standard `{ data, error }` envelope returned by `apiFetch`.
 *
 * - Throws when `envelope.error` is set, propagating the API failure message.
 * - Returns `envelope.data` when present, otherwise returns the response
 *   verbatim so callers can keep using the shape.
 */
export function unwrapApiPayload<T = unknown>(response: unknown): T {
  const envelope = response as { error?: string; data?: unknown } | null | undefined;
  if (envelope?.error) {
    throw new Error(envelope.error);
  }

  return (envelope?.data ?? response) as T;
}

/**
 * Builds an SVG `<polyline points="…" />` string for the decorative
 * idle-state waveform used while the canvas animation is mounting or when
 * `prefers-reduced-motion` is active.
 *
 * Pure / deterministic given `(width, height, intensity)`.
 */
export function buildStaticWavePoints(width: number, height: number, intensity: number): string {
  const sampleCount = Math.max(2, Math.floor(width / 2));
  const amplitude = height * 0.2 * intensity;
  return Array.from({ length: sampleCount }, (_, index) => {
    const x = (index / (sampleCount - 1)) * width;
    const y = height / 2 + Math.sin(index * 0.55) * amplitude;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}
