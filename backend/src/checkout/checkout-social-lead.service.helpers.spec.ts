import { CheckoutSocialLeadStatus, CheckoutSocialProvider } from '@prisma/client';
import {
  buildCaptureLeadCreateData,
  buildCaptureLeadResponse,
  buildContactUpsertArgs,
  buildConvertedUpdateData,
  buildLeadUpdateData,
  buildPrefillOrFilter,
  computeUpdatedLeadFields,
  type CheckoutPlanContext,
  type VerifiedSocialProfile,
} from './checkout-social-lead.service.helpers';

const plan: CheckoutPlanContext = {
  id: 'plan-1',
  slug: 'pro-plan',
  productId: 'prod-1',
  workspaceId: 'ws-1',
};

const verified: VerifiedSocialProfile = {
  provider: CheckoutSocialProvider.GOOGLE,
  providerId: 'g-123',
  emailVerified: true,
  email: '  USER@gmail.com  ',
  name: '  Daniel  ',
  image: '  https://img.test/x.png  ',
};

describe('buildCaptureLeadCreateData', () => {
  it('normalizes verified profile fields and merges plan context', () => {
    const data = buildCaptureLeadCreateData(plan, CheckoutSocialProvider.GOOGLE, verified, {
      slug: plan.slug,
      provider: 'google',
      checkoutCode: '  CODE-123  ',
      sourceUrl: ' https://src.test ',
      utmSource: '  ',
      utmMedium: 'cpc',
      deviceFingerprint: ' fp-1 ',
    } as never);

    expect(data.workspaceId).toBe('ws-1');
    expect(data.planId).toBe('plan-1');
    expect(data.productId).toBe('prod-1');
    expect(data.checkoutSlug).toBe('pro-plan');
    expect(data.checkoutCode).toBe('CODE-123');
    expect(data.provider).toBe(CheckoutSocialProvider.GOOGLE);
    expect(data.providerId).toBe('g-123');
    expect(data.providerEmailVerified).toBe(true);
    expect(data.name).toBe('Daniel');
    expect(data.email).toBe('user@gmail.com');
    expect(data.avatarUrl).toBe('https://img.test/x.png');
    expect(data.sourceUrl).toBe('https://src.test');
    expect(data.utmSource).toBeNull();
    expect(data.utmMedium).toBe('cpc');
    expect(data.deviceFingerprint).toBe('fp-1');
    expect(data.providerPayload).toEqual({
      provider: 'GOOGLE',
      providerId: 'g-123',
      emailVerified: true,
    });
  });

  it('returns null for absent optional UTM and attribution fields', () => {
    const data = buildCaptureLeadCreateData(plan, CheckoutSocialProvider.APPLE, verified, {
      slug: plan.slug,
      provider: 'apple',
    } as never);
    expect(data.utmSource).toBeNull();
    expect(data.utmCampaign).toBeNull();
    expect(data.utmContent).toBeNull();
    expect(data.utmTerm).toBeNull();
    expect(data.fbclid).toBeNull();
    expect(data.gclid).toBeNull();
    expect(data.deviceFingerprint).toBeNull();
    expect(data.refererUrl).toBeNull();
  });
});

describe('buildCaptureLeadResponse', () => {
  it('maps a captured lead record into the public response shape', () => {
    const response = buildCaptureLeadResponse(
      {
        id: 'lead-1',
        name: 'Daniel',
        email: 'user@gmail.com',
        avatarUrl: 'https://img/x.png',
        deviceFingerprint: 'fp-1',
        workspaceId: 'ws-1',
        checkoutSlug: 'pro-plan',
      },
      'google',
    );

    expect(response).toEqual({
      leadId: 'lead-1',
      provider: 'google',
      name: 'Daniel',
      email: 'user@gmail.com',
      avatarUrl: 'https://img/x.png',
      deviceFingerprint: 'fp-1',
      workspaceId: 'ws-1',
      checkoutSlug: 'pro-plan',
    });
  });
});

describe('buildPrefillOrFilter', () => {
  it('returns only the slug clause when checkoutCode is null', () => {
    expect(buildPrefillOrFilter('pro-plan', null)).toEqual([{ checkoutSlug: 'pro-plan' }]);
  });

  it('includes the checkoutCode clause when provided', () => {
    expect(buildPrefillOrFilter('pro-plan', 'CODE-1')).toEqual([
      { checkoutSlug: 'pro-plan' },
      { checkoutCode: 'CODE-1' },
    ]);
  });
});

describe('computeUpdatedLeadFields', () => {
  const existing = {
    workspaceId: 'ws-1',
    name: 'Old Name',
    email: 'old@test.com',
    phone: '11999999999',
    cpf: '12345678900',
    enrichmentData: null,
    stepReached: 1,
  };

  it('keeps existing values when dto fields are blank or omitted', () => {
    const result = computeUpdatedLeadFields(existing, {});
    expect(result.normalizedName).toBe('Old Name');
    expect(result.normalizedEmail).toBe('old@test.com');
    expect(result.normalizedPhone).toBe('11999999999');
    expect(result.normalizedCpf).toBe('12345678900');
    expect(result.nextStep).toBe(1);
    expect(result.mergedEnrichmentData).toBeUndefined();
  });

  it('overrides existing values with normalized dto fields', () => {
    const result = computeUpdatedLeadFields(existing, {
      name: '  New Name ',
      email: ' NEW@TEST.COM ',
      phone: '11 88888-7777',
      cpf: ' 98765432100 ',
      stepReached: 2,
    });
    expect(result.normalizedName).toBe('New Name');
    expect(result.normalizedEmail).toBe('new@test.com');
    expect(result.normalizedPhone).toBe('11888887777');
    expect(result.normalizedCpf).toBe('98765432100');
    expect(result.nextStep).toBe(2);
  });

  it('never regresses stepReached below the existing value', () => {
    const result = computeUpdatedLeadFields(
      { ...existing, stepReached: 3 },
      {
        stepReached: 1,
      },
    );
    expect(result.nextStep).toBe(3);
  });

  it('returns a merged enrichment payload when address fields are present', () => {
    const result = computeUpdatedLeadFields(existing, {
      cep: '01000-000',
      city: 'São Paulo',
    });
    expect(result.mergedEnrichmentData).toBeDefined();
    const merged = result.mergedEnrichmentData as { address?: Record<string, unknown> };
    expect(merged.address).toMatchObject({ cep: '01000-000', city: 'São Paulo' });
  });
});

describe('buildLeadUpdateData', () => {
  it('includes enrichmentData only when defined', () => {
    const withMerge = buildLeadUpdateData({
      workspaceId: 'ws-1',
      normalizedName: 'A',
      normalizedEmail: 'a@b.com',
      normalizedPhone: '11999',
      normalizedCpf: null,
      nextStep: 2,
      mergedEnrichmentData: { foo: 'bar' },
    });
    expect(withMerge.enrichmentData).toEqual({ foo: 'bar' });

    const withoutMerge = buildLeadUpdateData({
      workspaceId: 'ws-1',
      normalizedName: 'A',
      normalizedEmail: 'a@b.com',
      normalizedPhone: '11999',
      normalizedCpf: null,
      nextStep: 2,
      mergedEnrichmentData: undefined,
    });
    expect('enrichmentData' in withoutMerge).toBe(false);
  });
});

describe('buildContactUpsertArgs', () => {
  it('returns null when phone has no digits', () => {
    expect(
      buildContactUpsertArgs({
        workspaceId: 'ws-1',
        phone: '   ',
      }),
    ).toBeNull();
  });

  it('builds upsert args with normalized digits-only phone and customFields flag', () => {
    const args = buildContactUpsertArgs({
      workspaceId: 'ws-1',
      name: '  Daniel ',
      email: ' D@TEST.COM ',
      phone: '+55 (11) 99999-8888',
    });
    expect(args).not.toBeNull();
    expect(args.where.workspaceId_phone.phone).toBe('5511999998888');
    expect(args.create.name).toBe('Daniel');
    expect(args.create.email).toBe('d@test.com');
    expect(args.create.customFields).toEqual({ checkoutSocialLead: true });
  });

  it('omits name from update payload when name is blank', () => {
    const args = buildContactUpsertArgs({
      workspaceId: 'ws-1',
      name: '   ',
      email: null,
      phone: '11999998888',
    });
    expect(args).not.toBeNull();
    expect('name' in args.update).toBe(false);
  });
});

describe('buildConvertedUpdateData', () => {
  it('produces a CONVERTED update payload with stepReached pinned to 3', () => {
    const at = new Date('2026-05-28T12:00:00Z');
    const data = buildConvertedUpdateData('order-1', CheckoutSocialLeadStatus.CONVERTED, at);
    expect(data.status).toBe(CheckoutSocialLeadStatus.CONVERTED);
    expect(data.convertedAt).toBe(at);
    expect(data.convertedOrderId).toBe('order-1');
    expect(data.stepReached).toBe(3);
  });

  it('defaults convertedAt to a fresh Date when not provided', () => {
    const before = Date.now();
    const data = buildConvertedUpdateData('order-1', CheckoutSocialLeadStatus.CONVERTED);
    const after = Date.now();
    expect(data.convertedAt).toBeInstanceOf(Date);
    expect((data.convertedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((data.convertedAt as Date).getTime()).toBeLessThanOrEqual(after);
  });
});
