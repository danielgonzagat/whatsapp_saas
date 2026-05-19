/**
 * Removes keys whose value is `undefined` from an object.
 *
 * Required because `exactOptionalPropertyTypes: true` rejects `{ key: undefined }`
 * for a target shape `{ key?: T }`. Use this helper at call sites that
 * conditionally include optional fields before passing to a typed API client.
 */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}
