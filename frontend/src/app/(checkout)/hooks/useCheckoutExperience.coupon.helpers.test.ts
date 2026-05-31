import { describe, expect, it } from 'vitest';

import {
  isCouponFlowEnabled,
  normalizeCouponDiscountInCents,
  resolveAppliedCouponCode,
  resolveCouponCodeForSubmission,
  resolveCouponErrorMessage,
  validateCouponPrerequisites,
} from './useCheckoutExperience.coupon.helpers';

describe('resolveCouponCodeForSubmission', () => {
  it('prefers the explicit override when provided', () => {
    expect(resolveCouponCodeForSubmission('  promo10  ', 'current')).toBe('PROMO10');
  });

  it('falls back to the current code when no override is provided', () => {
    expect(resolveCouponCodeForSubmission(undefined, ' welcome ')).toBe('WELCOME');
  });

  it('returns an empty string when both values are empty', () => {
    expect(resolveCouponCodeForSubmission(undefined, '')).toBe('');
    expect(resolveCouponCodeForSubmission('', '')).toBe('');
  });

  it('upper-cases mixed-case input', () => {
    expect(resolveCouponCodeForSubmission('GoLd2026', '')).toBe('GOLD2026');
  });

  it('treats whitespace-only explicit as truthy (preserves legacy hook semantics) and trims it out', () => {
    // `'   '` is truthy in JS, so the OR-chain keeps it; .trim() then collapses it to ''.
    // This mirrors the pre-extraction behavior — documented here to lock it in.
    expect(resolveCouponCodeForSubmission('   ', 'fallback')).toBe('');
  });
});

describe('validateCouponPrerequisites', () => {
  it('returns the "missing code" message when nextCode is empty', () => {
    expect(validateCouponPrerequisites('', 'ws1', 'plan1')).toBe('Digite um cupom.');
  });

  it('returns the "missing context" message when workspaceId is absent', () => {
    expect(validateCouponPrerequisites('PROMO', undefined, 'plan1')).toBe(
      'Checkout sem contexto para validar cupom.',
    );
  });

  it('returns the "missing context" message when planId is absent', () => {
    expect(validateCouponPrerequisites('PROMO', 'ws1', undefined)).toBe(
      'Checkout sem contexto para validar cupom.',
    );
  });

  it('returns null when all prerequisites are present', () => {
    expect(validateCouponPrerequisites('PROMO', 'ws1', 'plan1')).toBeNull();
  });

  it('checks the empty-code branch before the context branch', () => {
    expect(validateCouponPrerequisites('', undefined, undefined)).toBe('Digite um cupom.');
  });
});

describe('isCouponFlowEnabled', () => {
  it('returns true when enableCoupon is undefined (defaults to enabled)', () => {
    expect(isCouponFlowEnabled(undefined)).toBe(true);
  });

  it('returns true when enableCoupon is true', () => {
    expect(isCouponFlowEnabled(true)).toBe(true);
  });

  it('returns false only when enableCoupon is explicitly false', () => {
    expect(isCouponFlowEnabled(false)).toBe(false);
  });
});

describe('resolveCouponErrorMessage', () => {
  it('uses the message of a thrown Error when present', () => {
    expect(resolveCouponErrorMessage(new Error('Cupom já utilizado'))).toBe('Cupom já utilizado');
  });

  it('falls back to the generic message when Error has no message', () => {
    expect(resolveCouponErrorMessage(new Error(''))).toBe('Cupom inválido ou expirado.');
  });

  it('falls back when the thrown value is not an Error', () => {
    expect(resolveCouponErrorMessage('string error')).toBe('Cupom inválido ou expirado.');
    expect(resolveCouponErrorMessage(null)).toBe('Cupom inválido ou expirado.');
    expect(resolveCouponErrorMessage(undefined)).toBe('Cupom inválido ou expirado.');
    expect(resolveCouponErrorMessage({ message: 'ignored' })).toBe(
      'Cupom inválido ou expirado.',
    );
  });
});

describe('normalizeCouponDiscountInCents', () => {
  it('coerces nullish to zero', () => {
    expect(normalizeCouponDiscountInCents(null)).toBe(0);
    expect(normalizeCouponDiscountInCents(undefined)).toBe(0);
  });

  it('clamps negative values to zero', () => {
    expect(normalizeCouponDiscountInCents(-500)).toBe(0);
  });

  it('rounds floats to the nearest integer', () => {
    expect(normalizeCouponDiscountInCents(199.4)).toBe(199);
    expect(normalizeCouponDiscountInCents(199.6)).toBe(200);
  });

  it('parses numeric strings', () => {
    expect(normalizeCouponDiscountInCents('1234')).toBe(1234);
  });

  it('returns zero for non-numeric strings', () => {
    expect(normalizeCouponDiscountInCents('abc')).toBe(0);
  });
});

describe('resolveAppliedCouponCode', () => {
  it('prefers the response code when present, upper-cased', () => {
    expect(resolveAppliedCouponCode('promo10', 'submitted')).toBe('PROMO10');
  });

  it('falls back to the submitted code when response code is missing', () => {
    expect(resolveAppliedCouponCode(undefined, 'submitted')).toBe('SUBMITTED');
  });

  it('falls back to the submitted code when response code is empty', () => {
    expect(resolveAppliedCouponCode('', 'submitted')).toBe('SUBMITTED');
  });

  it('upper-cases already-upper inputs idempotently', () => {
    expect(resolveAppliedCouponCode('PROMO', 'OTHER')).toBe('PROMO');
  });
});
