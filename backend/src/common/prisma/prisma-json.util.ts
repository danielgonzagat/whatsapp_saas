import { Prisma } from '@prisma/client';

export function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toPrismaJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue> = {};

    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        continue;
      }
      result[key] = toPrismaJsonValue(entry);
    }

    return result as Prisma.InputJsonObject;
  }

  throw new TypeError(`Unsupported Prisma JSON value type: ${typeof value}`);
}

export function toPrismaJsonArray(value: readonly unknown[]): Prisma.InputJsonArray {
  return value.map((entry) => toPrismaJsonValue(entry));
}
