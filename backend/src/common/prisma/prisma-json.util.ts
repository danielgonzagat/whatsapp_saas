import { Prisma } from '@prisma/client';

function isPrimitiveJson(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function coerceScalar(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null) return null;
  if (isPrimitiveJson(value)) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function toPrismaJsonObject(value: object): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    result[key] = toPrismaJsonValue(entry);
  }
  return result as Prisma.InputJsonObject;
}

export function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  const scalar = coerceScalar(value);
  if (scalar !== undefined) return scalar;

  if (Array.isArray(value)) {
    return value.map((entry) => toPrismaJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    return toPrismaJsonObject(value);
  }

  throw new TypeError(`Unsupported Prisma JSON value type: ${typeof value}`);
}

export function toPrismaJsonArray(value: readonly unknown[]): Prisma.InputJsonArray {
  return value.map((entry) => toPrismaJsonValue(entry));
}
