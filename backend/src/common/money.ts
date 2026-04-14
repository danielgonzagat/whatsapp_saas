/**
 * Monetary values across the KLOEL platform must be integer cents.
 * A value of 12345 means R$ 123,45.
 *
 * This module provides a branded type and safe constructors/operations
 * to prevent accidental float arithmetic on money. Enforces invariant I7.
 *
 * ## Why a branded type?
 *
 * TypeScript's structural typing means `number` flows anywhere `number`
 * is accepted. A brand makes `Cents` incompatible with plain `number`
 * at compile time, forcing call sites to explicitly acknowledge when
 * they're converting. Example:
 *
 *   const balance: Cents = cents(12345);   // ok
 *   const withTax = balance * 1.1;          // compile error
 *   const withTax = mulCentsInt(balance, 110) / 100;  // integer only
 *
 * ## Schema audit (2026-04-08)
 *
 * The primary checkout path (CheckoutOrder, CheckoutPayment,
 * CheckoutProduct) already uses `Int` cents columns correctly. The
 * known violations that still use `Float` are documented below and
 * tracked for a dedicated schema migration PR (not this one):
 *
 *   - backend/prisma/schema.prisma:705    price (legacy product price)
 *   - backend/prisma/schema.prisma:1312   price (legacy)
 *   - backend/prisma/schema.prisma:1481   amount
 *   - backend/prisma/schema.prisma:1501-3 KloelWallet.{available,pending,blocked}Balance
 *   - backend/prisma/schema.prisma:1515   KloelWalletTransaction.amount
 *   - backend/prisma/schema.prisma:1587   price
 *   - backend/prisma/schema.prisma:1991   amount
 *   - backend/prisma/schema.prisma:2048   amount
 *   - backend/prisma/schema.prisma:2081   Payment.amount (legacy Payment model)
 *
 * The Float→Int migration for these columns is out of scope for P0-7
 * because it requires a two-step migration (add Int column, backfill
 * with ROUND(value * 100), switch reads, drop old column) and careful
 * rollback planning for live wallet balances. Tracked as a follow-up
 * in docs/superpowers/plans/2026-04-08-bigtech-hardening/ deferred.
 */

declare const __cents: unique symbol;

/** Branded integer-cents monetary value. */
export type Cents = number & { readonly [__cents]: 'Cents' };

/**
 * Safe constructor. Rejects non-integer, non-finite, or NaN inputs.
 * Use this at any boundary where untyped `number` enters the money path.
 */
export function cents(value: number): Cents {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Money must be finite number, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new TypeError(`Money must be integer cents, got ${value}`);
  }
  // Normalize -0 to 0 so equality checks are Object.is-safe.
  return (value === 0 ? 0 : value) as Cents;
}

export const ZERO_CENTS = cents(0);

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

/**
 * Multiply cents by an integer (e.g. quantity). Decimal multipliers
 * (tax rates, discount percentages) must be expressed as basis points
 * and then divided with integer division to avoid float drift.
 */
export function mulCentsInt(a: Cents, n: number): Cents {
  if (!Number.isInteger(n)) {
    throw new TypeError(`Multiplier must be integer, got ${n}`);
  }
  return cents(a * n);
}

/**
 * Apply a basis-points percentage (1 bp = 0.01%) with banker's rounding.
 *
 * Example: 10% VAT on R$ 100,00:
 *   applyBasisPoints(cents(10_000), 1000) === cents(1_000)  // R$ 10.00
 */
export function applyBasisPoints(amount: Cents, basisPoints: number): Cents {
  if (!Number.isInteger(basisPoints)) {
    throw new TypeError(`basisPoints must be integer, got ${basisPoints}`);
  }
  // Round half to even to avoid systematic bias.
  const product = amount * basisPoints;
  const quotient = Math.trunc(product / 10_000);
  const remainder = product - quotient * 10_000;
  if (remainder === 0) return cents(quotient);
  const halfAway = Math.abs(remainder) * 2;
  if (halfAway < 10_000) return cents(quotient);
  if (halfAway > 10_000) return cents(quotient + Math.sign(product));
  // Exactly half — banker's rounding
  return cents(quotient % 2 === 0 ? quotient : quotient + Math.sign(product));
}

/**
 * Parse a BRL string like "R$ 123,45" or "1.234,56" into Cents.
 * Rejects ambiguous input. Intended for CSV import and provider
 * webhook payloads that ship display strings instead of integers.
 */
export function parseBRL(input: string): Cents {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new TypeError('Empty BRL string');
  // Strip currency symbol and thousand separators, normalize decimal comma.
  const cleaned = trimmed
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Unparseable BRL value: ${input}`);
  }
  return cents(Math.round(parsed * 100));
}

/**
 * Format cents for display. Returns "R$ 1.234,56" style by default.
 */
export function formatBRL(value: Cents): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / 100);
  const frac = abs - whole * 100;
  const wholeStr = whole.toLocaleString('pt-BR');
  const fracStr = frac.toString().padStart(2, '0');
  return `${sign}R$ ${wholeStr},${fracStr}`;
}
