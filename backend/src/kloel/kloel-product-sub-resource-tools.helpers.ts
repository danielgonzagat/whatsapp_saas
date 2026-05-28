import type { PrismaService } from '../prisma/prisma.service';
import type { UnknownRecord } from '../common/types';

/**
 * Coerces an unknown value to a string. Numbers/booleans are stringified.
 * Anything else (object, array, null, undefined) falls back.
 */
export function parseStr(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback;
}

/**
 * Coerces an unknown value to a finite number, otherwise the fallback.
 */
export function parseNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Returns the subset of `keys` whose trimmed string value in `args` is empty.
 * Used to validate that required string inputs are present.
 */
export function missingStringInputs(args: UnknownRecord, keys: string[]): string[] {
  return keys.filter((key) => !parseStr(args[key]).trim());
}

/**
 * Builds the buyer-data payload expected by SalesService.createBoletoOrder
 * from a free-form args bag. Pure transform — no DB access.
 */
export function boletoBuyerDataFromArgs(args: UnknownRecord) {
  const neighborhood = parseStr(args.customerNeighborhood).trim();
  return {
    name: parseStr(args.customerName).trim(),
    email: parseStr(args.customerEmail).trim(),
    cpf: parseStr(args.customerCpf).trim(),
    phone: parseStr(args.customerPhone).trim(),
    address: {
      zipCode: parseStr(args.customerZipCode).replace(/\D/g, ''),
      street: parseStr(args.customerStreet).trim(),
      number: parseStr(args.customerNumber).trim(),
      ...(neighborhood ? { neighborhood } : {}),
      city: parseStr(args.customerCity).trim(),
      state: parseStr(args.customerState)
        .replace(/[^a-z]/gi, '')
        .toUpperCase(),
    },
  };
}

/**
 * Resolves a product id given:
 *   - explicit `args.productId`, OR
 *   - case-insensitive `name contains` lookup of `args.productName` within workspace.
 *
 * Returns the id or an empty string when not found.
 */
export async function resolveProductIdByName(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
): Promise<string> {
  const explicit = parseStr(args.productId);
  if (explicit) {
    return explicit;
  }
  const productName = parseStr(args.productName);
  if (!productName) {
    return '';
  }
  const found = await prisma.product.findFirst({
    where: {
      workspaceId,
      name: { contains: productName, mode: 'insensitive' },
    },
  });
  return found?.id ?? '';
}

/**
 * Strips diacritics and lowercases — used for accent-insensitive fallback matching.
 */
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeForAccentFallback(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
}

/**
 * Same as {@link resolveProductIdByName} but, when the contains-insensitive query
 * misses, performs an in-memory accent-insensitive scan of up to 200 workspace
 * products. This covers cases like accented vs unaccented product names.
 */
export async function resolveProductIdWithAccentFallback(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
): Promise<string> {
  const direct = await resolveProductIdByName(prisma, workspaceId, args);
  if (direct) {
    return direct;
  }
  const productName = parseStr(args.productName);
  if (!productName) {
    return '';
  }
  const stripped = normalizeForAccentFallback(productName);
  const all = await prisma.product.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    take: 200,
  });
  const found = all.find((prod) => normalizeForAccentFallback(prod.name).includes(stripped));
  return found?.id ?? '';
}
