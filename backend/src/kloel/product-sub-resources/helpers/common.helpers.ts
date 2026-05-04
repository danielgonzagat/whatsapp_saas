import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../../common/interfaces';
import { PrismaService } from '../../../prisma/prisma.service';

export const U0300__U036F_RE = /[\u0300-\u036f]/g;
export const A_Z0_9_RE = /[^a-z0-9]+/g;
export const PATTERN_RE = /^-+|-+$/g;

export function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

/** Loose body type — accepts idempotencyKey and any other fields for safe retry.
 *  Values are narrowed at each consumption site via parseObject/parseNumber/etc.
 *  Using `unknown` here would cascade 100+ casts through helper functions that
 *  already perform runtime narrowing, so we keep the structural escape hatch. */
export type LooseObject = Record<string, unknown>;

export function getWorkspaceId(req: AuthenticatedRequest): string {
  return req.user?.workspaceId || req.workspaceId || '';
}

export async function ensureWorkspaceProductAccess(
  prisma: PrismaService,
  productId: string,
  workspaceId: string,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
  });

  if (!product) {
    throw new NotFoundException('Produto não encontrado');
  }

  return product;
}

export function parseObject(value: unknown): LooseObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as LooseObject;
}

export function parseNumber(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeOptionalEmail(value: unknown): string | null {
  const email = safeStr(value).trim().toLowerCase();
  return email || null;
}

export function normalizeOptionalText(value: unknown): string | null {
  const text = safeStr(value).trim();
  return text || null;
}

export function assertPercentageRange(
  value: number | undefined,
  fieldLabel: string,
  {
    min = 0,
    max = 100,
  }: {
    min?: number;
    max?: number;
  } = {},
) {
  if (value === undefined) {
    return;
  }

  if (value < min || value > max) {
    throw new BadRequestException(`${fieldLabel} precisa ficar entre ${min} e ${max}`);
  }
}

export function findSingleAtIndex(email: string): number {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return -1;
  }
  if (atIndex !== email.lastIndexOf('@')) {
    return -1;
  }
  if (atIndex === email.length - 1) {
    return -1;
  }
  return atIndex;
}

export function isValidEmailDomain(domain: string): boolean {
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }
  const dotIndex = domain.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < domain.length - 1;
}

export function isValidEmail(value: string): boolean {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  if (!email || email.includes(' ')) {
    return false;
  }

  const atIndex = findSingleAtIndex(email);
  if (atIndex < 0) {
    return false;
  }

  const local = email.slice(0, atIndex);
  if (!local) {
    return false;
  }

  return isValidEmailDomain(email.slice(atIndex + 1));
}

export function slugifyPlan(name: string, id: string) {
  const base = String(name || 'plano')
    .normalize('NFD')
    .replace(U0300__U036F_RE, '')
    .toLowerCase()
    .replace(A_Z0_9_RE, '-')
    .replace(PATTERN_RE, '')
    .slice(0, 48);

  return `${base || 'plano'}-${id.slice(0, 8)}`;
}

export function removeUndefined<T extends LooseObject>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export function pickRecordOrUndefined(value: unknown): LooseObject | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseObject;
  }
  return undefined;
}

export function pickDefined<T extends LooseObject, K extends string>(
  source: T,
  keys: readonly K[],
): LooseObject {
  const result: LooseObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

export function pickRenamed(
  source: LooseObject,
  mapping: ReadonlyArray<readonly [string, string]>,
): LooseObject {
  const result: LooseObject = {};
  for (const [sourceKey, targetKey] of mapping) {
    if (source[sourceKey] !== undefined) {
      result[targetKey] = source[sourceKey];
    }
  }
  return result;
}

export function pickFirstDefined(source: LooseObject, keys: readonly string[], fallback: unknown) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return fallback;
}

export function coerceArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function coerceObject(value: unknown): LooseObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseObject) : {};
}
