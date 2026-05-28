/**
 * Generates a stable React key for list items that may have duplicate values.
 *
 * For each position in `values`, returns `${prefix}-${value.slice(0, 24)}-${occurrence}`
 * where `occurrence` counts prior duplicates of the same value. This keeps keys
 * stable across re-renders even when two items have the same string content
 * (e.g. two empty placeholders, two identical email addresses).
 *
 * Canonical helper shared by settings sections (attendance-rules /
 * company-identity / ...) that render lists of plain-text inputs.
 */
export function buildDuplicateAwareKey(
  prefix: string,
  values: string[],
  position: number,
): string {
  const currentValue = values[position] ?? '';
  const occurrence = values.slice(0, position).filter((value) => value === currentValue).length;
  return `${prefix}-${currentValue.slice(0, 24)}-${occurrence}`;
}
