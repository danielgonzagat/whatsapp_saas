import { Prisma } from '@prisma/client';

export function isPrimitiveJson(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function coerceScalarJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null) {
    return null;
  }
  if (isPrimitiveJson(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

export function isPlainJsonObject(value: unknown): value is object {
  return !!value && typeof value === 'object';
}
