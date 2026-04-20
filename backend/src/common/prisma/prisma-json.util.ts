import { Prisma } from '@prisma/client';
import { coerceScalarJson, isPlainJsonObject } from './prisma-json-scalar.util';

function coerceObjectEntries(value: object): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }
    result[key] = toPrismaJsonValue(entry);
  }
  return result as Prisma.InputJsonObject;
}

/** To prisma json value. */
export function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  const scalar = coerceScalarJson(value);
  if (scalar !== undefined) {
    return scalar;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toPrismaJsonValue(entry));
  }
  if (isPlainJsonObject(value)) {
    return coerceObjectEntries(value);
  }
  throw new TypeError(`Unsupported Prisma JSON value type: ${typeof value}`);
}

/** To prisma json array. */
export function toPrismaJsonArray(value: readonly unknown[]): Prisma.InputJsonArray {
  return value.map((entry) => toPrismaJsonValue(entry));
}
