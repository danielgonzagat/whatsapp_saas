import type { Prisma } from '@prisma/client';

/** Coerce a scalar JSON-compatible primitive into Prisma.InputJsonValue. */
function coerceScalar(value: unknown): Prisma.InputJsonValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function coerceObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    out[key] = toPrismaJsonValue(entry);
  }
  return out;
}

/**
 * Convert any JSON-serializable runtime value into Prisma.InputJsonValue.
 * Accepts null (returns null, which is Prisma.JsonNull in Prisma v5+).
 * Throws on non-serializable inputs (functions, symbols, bigints, Dates, class instances).
 * Mirrors backend/src/common/prisma/prisma-json.util.ts so worker code does not
 * need cross-package imports.
 */
export function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  const scalar = coerceScalar(value);
  if (scalar !== undefined) return scalar;
  if (Array.isArray(value)) {
    return value.map((entry) => toPrismaJsonValue(entry));
  }
  if (isPlainObject(value)) {
    return coerceObject(value);
  }
  throw new TypeError(`Unsupported Prisma JSON value type: ${typeof value}`);
}
