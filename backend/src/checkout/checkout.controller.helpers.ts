/**
 * Pure helpers extracted from CheckoutController to keep the controller fino
 * and the slug/timer/config-merge logic unit-testable in isolation.
 */
import { Prisma, TimerType } from '@prisma/client';

import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { DIACRITICS_RE, SLUG_EDGE_HYPHEN_RE } from '../common/regex';

const A_Z0_9_RE = /[^a-z0-9]+/g;

/**
 * Normalizes a raw timer-type input (string, number, boolean) into the
 * canonical {@link TimerType} enum, returning `undefined` when the input
 * is neither a recognized synonym nor a coercible primitive.
 */
export function normalizeTimerType(value: unknown): TimerType | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }

  const normalized = String(value).trim().toUpperCase();

  if (normalized === 'COUNTDOWN' || normalized === 'EVERGREEN') {
    return TimerType.COUNTDOWN;
  }

  if (normalized === 'EXPIRATION' || normalized === 'FIXED') {
    return TimerType.EXPIRATION;
  }

  if (normalized === TimerType.STOCK) {
    return TimerType.STOCK;
  }

  return undefined;
}

/**
 * Slugifies an arbitrary string into a URL-safe segment with a base36
 * timestamp suffix. Used for plan/checkout slug generation.
 */
export function buildCheckoutSlug(value: string, now: Date = new Date()): string {
  const base = String(value || 'checkout')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(A_Z0_9_RE, '-')
    .replace(SLUG_EDGE_HYPHEN_RE, '')
    .slice(0, 48);

  return `${base || 'checkout'}-${now.getTime().toString(36)}`;
}

/**
 * Generates a deterministic product slug from the product name. Mirrors the
 * inline expression previously hand-rolled in {@link CheckoutController.createProduct}.
 */
export function buildProductSlug(name: string | undefined, now: Date = new Date()): string {
  const base = (name || 'product')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(A_Z0_9_RE, '-')
    .replace(SLUG_EDGE_HYPHEN_RE, '');
  return `${base}-${now.getTime().toString(36)}`;
}

/**
 * Extracts the {@link Prisma.PrismaClientKnownRequestError}-style `code`
 * field from an unknown thrown value, defaulting to `'unknown'`.
 */
export function extractErrorCode(err: unknown, fallback = 'unknown'): string {
  return (err as { code?: string })?.code ?? fallback;
}

/**
 * Shape of the partial config DTO consumed by {@link buildCheckoutConfigUpdateInput}.
 * Kept open-ended (`Record<string, unknown>`) because controller passes the
 * leftover keys after destructuring known fields.
 */
export interface CheckoutConfigUpdateBuildInput {
  timerType?: unknown;
  testimonials?: unknown;
  trustBadges?: unknown;
  rest: Record<string, unknown>;
}

/**
 * Builds the typed Prisma update payload for `checkoutConfig` from a partial
 * update DTO. Normalizes timer type and JSON-coerces the testimonials and
 * trust-badge fields; copies the remaining defined keys verbatim.
 */
export function buildCheckoutConfigUpdateInput(
  input: CheckoutConfigUpdateBuildInput,
): Prisma.CheckoutConfigUpdateInput {
  const normalizedTimer =
    input.timerType !== undefined ? normalizeTimerType(input.timerType) : undefined;
  const normalizedTestimonials =
    input.testimonials !== undefined ? toPrismaJsonValue(input.testimonials) : undefined;
  const normalizedTrustBadges =
    input.trustBadges !== undefined ? toPrismaJsonValue(input.trustBadges) : undefined;

  const configInput: Prisma.CheckoutConfigUpdateInput = {
    ...(normalizedTimer !== undefined ? { timerType: normalizedTimer } : {}),
    ...(normalizedTestimonials !== undefined ? { testimonials: normalizedTestimonials } : {}),
    ...(normalizedTrustBadges !== undefined ? { trustBadges: normalizedTrustBadges } : {}),
  };

  for (const [key, value] of Object.entries(input.rest)) {
    if (value !== undefined) {
      (configInput as Record<string, unknown>)[key] = value;
    }
  }

  return configInput;
}
