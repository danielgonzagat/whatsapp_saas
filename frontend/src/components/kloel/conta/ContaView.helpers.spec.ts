import { describe, expect, it } from 'vitest';

import {
  EMPTY_BILLING_SUMMARY,
  buildSectionQueryString,
  buildSectionUrl,
  canSubmitKyc,
  getCompletionPercentage,
  getKycStatusValue,
  getSectionStatus,
  isKycBlocked,
  normalizeSubscriptionStatus,
  parseBillingSummary,
  shouldShowSystemAlerts,
} from './ContaView.helpers';

describe('getCompletionPercentage', () => {
  it('returns 0 when the completion payload is missing', () => {
    expect(getCompletionPercentage(null)).toBe(0);
    expect(getCompletionPercentage(undefined)).toBe(0);
  });

  it('returns the percentage when finite', () => {
    expect(getCompletionPercentage({ percentage: 42 })).toBe(42);
    expect(getCompletionPercentage({ percentage: 0 })).toBe(0);
    expect(getCompletionPercentage({ percentage: 100 })).toBe(100);
  });

  it('falls back to 0 for non-finite or non-numeric percentages', () => {
    expect(getCompletionPercentage({ percentage: Number.NaN })).toBe(0);
    expect(getCompletionPercentage({ percentage: Number.POSITIVE_INFINITY })).toBe(0);
    expect(
      getCompletionPercentage({ percentage: '50' as unknown as number }),
    ).toBe(0);
  });
});

describe('getKycStatusValue', () => {
  it('defaults to pending when status is missing', () => {
    expect(getKycStatusValue(null)).toBe('pending');
    expect(getKycStatusValue(undefined)).toBe('pending');
    expect(getKycStatusValue({})).toBe('pending');
    expect(getKycStatusValue({ kycStatus: null })).toBe('pending');
    expect(getKycStatusValue({ kycStatus: '' })).toBe('pending');
  });

  it('returns the kycStatus when present', () => {
    expect(getKycStatusValue({ kycStatus: 'approved' })).toBe('approved');
    expect(getKycStatusValue({ kycStatus: 'in_review' })).toBe('in_review');
  });
});

describe('getSectionStatus', () => {
  it('returns approved only when the named section is marked complete', () => {
    const completion = {
      percentage: 60,
      sections: [
        { name: 'profile', complete: true },
        { name: 'fiscal', complete: false },
      ],
    };

    expect(getSectionStatus(completion, 'profile')).toBe('approved');
    expect(getSectionStatus(completion, 'fiscal')).toBe('pending');
  });

  it('returns pending for unknown sections', () => {
    expect(getSectionStatus({ percentage: 0, sections: [] }, 'profile')).toBe('pending');
  });

  it('returns pending when the completion payload is empty', () => {
    expect(getSectionStatus(null, 'profile')).toBe('pending');
    expect(getSectionStatus(undefined, 'profile')).toBe('pending');
    expect(getSectionStatus({ percentage: 0 }, 'profile')).toBe('pending');
  });
});

describe('isKycBlocked', () => {
  it('blocks while percentage is below 100', () => {
    expect(isKycBlocked(0, 'approved')).toBe(true);
    expect(isKycBlocked(99, 'approved')).toBe(true);
  });

  it('blocks while status is not approved, even at 100%', () => {
    expect(isKycBlocked(100, 'pending')).toBe(true);
    expect(isKycBlocked(100, 'in_review')).toBe(true);
  });

  it('unblocks only when complete and approved', () => {
    expect(isKycBlocked(100, 'approved')).toBe(false);
  });
});

describe('canSubmitKyc', () => {
  it('allows submission only at 100% with pending status', () => {
    expect(canSubmitKyc(100, 'pending')).toBe(true);
  });

  it('denies submission below 100%', () => {
    expect(canSubmitKyc(99, 'pending')).toBe(false);
  });

  it('denies submission once approved or in another state', () => {
    expect(canSubmitKyc(100, 'approved')).toBe(false);
    expect(canSubmitKyc(100, 'rejected')).toBe(false);
  });
});

describe('shouldShowSystemAlerts', () => {
  it('shows alerts on operational sections', () => {
    for (const section of [
      'account',
      'billing',
      'apps',
      'brain',
      'crm',
      'analytics',
      'activity',
    ] as const) {
      expect(shouldShowSystemAlerts(section)).toBe(true);
    }
  });

  it('hides alerts on KYC-style identity sections', () => {
    for (const section of [
      'pessoal',
      'fiscal',
      'documentos',
      'bancario',
      'seguranca',
      'equipe',
      'notificacoes',
      'perfil',
      'idiomas',
      'presentear',
      'saiba-mais',
      'ajuda',
      'sair',
    ] as const) {
      expect(shouldShowSystemAlerts(section)).toBe(false);
    }
  });
});

describe('buildSectionQueryString', () => {
  it('drops the section param when switching to the default section', () => {
    const search = new URLSearchParams('section=billing&utm=foo');
    expect(buildSectionQueryString(search, 'pessoal')).toBe('utm=foo');
  });

  it('sets the section param when switching to a non-default section', () => {
    const search = new URLSearchParams('utm=foo');
    expect(buildSectionQueryString(search, 'billing')).toBe('utm=foo&section=billing');
  });

  it('replaces an existing section param', () => {
    expect(buildSectionQueryString('section=apps', 'billing')).toBe('section=billing');
  });

  it('honors a custom default section', () => {
    expect(buildSectionQueryString('section=billing', 'apps', 'apps')).toBe('');
  });
});

describe('buildSectionUrl', () => {
  it('returns the pathname alone when no query remains', () => {
    expect(buildSectionUrl('/conta', '', 'pessoal')).toBe('/conta');
  });

  it('appends the rebuilt query string when present', () => {
    expect(buildSectionUrl('/conta', '', 'billing')).toBe('/conta?section=billing');
  });

  it('preserves other params while switching sections', () => {
    expect(buildSectionUrl('/conta', 'section=apps&ref=a', 'billing')).toBe(
      '/conta?section=billing&ref=a',
    );
  });
});

describe('normalizeSubscriptionStatus', () => {
  it('passes through the strict union values', () => {
    expect(normalizeSubscriptionStatus('trial')).toBe('trial');
    expect(normalizeSubscriptionStatus('active')).toBe('active');
    expect(normalizeSubscriptionStatus('expired')).toBe('expired');
    expect(normalizeSubscriptionStatus('suspended')).toBe('suspended');
    expect(normalizeSubscriptionStatus('none')).toBe('none');
  });

  it('collapses unknown / nullish values to none', () => {
    expect(normalizeSubscriptionStatus(null)).toBe('none');
    expect(normalizeSubscriptionStatus(undefined)).toBe('none');
    expect(normalizeSubscriptionStatus('')).toBe('none');
    expect(normalizeSubscriptionStatus('paused')).toBe('none');
    expect(normalizeSubscriptionStatus(42)).toBe('none');
  });
});

describe('parseBillingSummary', () => {
  it('returns the empty summary baseline when no subscription is present', () => {
    expect(parseBillingSummary(null, null)).toEqual(EMPTY_BILLING_SUMMARY);
    expect(parseBillingSummary(undefined, undefined)).toEqual(EMPTY_BILLING_SUMMARY);
  });

  it('detects a saved card via the payment-methods payload length', () => {
    expect(
      parseBillingSummary(null, { paymentMethods: [{ id: 'pm_1' }] }),
    ).toEqual({
      ...EMPTY_BILLING_SUMMARY,
      hasCard: true,
    });
  });

  it('parses a full subscription payload into the normalized shape', () => {
    expect(
      parseBillingSummary(
        { status: 'active', trialDaysLeft: 5, creditsBalance: 1200 },
        { paymentMethods: [{ id: 'pm_1' }] },
      ),
    ).toEqual({
      subscriptionStatus: 'active',
      trialDaysLeft: 5,
      creditsBalance: 1200,
      hasCard: true,
    });
  });

  it('coerces missing numeric counters to 0', () => {
    expect(
      parseBillingSummary({ status: 'trial' }, { paymentMethods: [] }),
    ).toEqual({
      subscriptionStatus: 'trial',
      trialDaysLeft: 0,
      creditsBalance: 0,
      hasCard: false,
    });
  });

  it('rejects unknown subscription statuses', () => {
    expect(
      parseBillingSummary({ status: 'paused' as unknown as 'active' }, null),
    ).toEqual({
      subscriptionStatus: 'none',
      trialDaysLeft: 0,
      creditsBalance: 0,
      hasCard: false,
    });
  });

  it('rejects negative or non-finite counters', () => {
    expect(
      parseBillingSummary(
        { status: 'trial', trialDaysLeft: -1, creditsBalance: Number.NaN },
        null,
      ),
    ).toEqual({
      subscriptionStatus: 'trial',
      trialDaysLeft: 0,
      creditsBalance: 0,
      hasCard: false,
    });
  });
});
