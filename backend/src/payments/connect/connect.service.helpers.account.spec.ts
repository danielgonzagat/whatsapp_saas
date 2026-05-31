import {
  buildCreateCustomAccountPayload,
  buildOnboardingAccountUpdate,
  projectOnboardingStatus,
  shouldRetryWithoutManualPayoutSchedule,
  stripManualPayoutSchedule,
} from './connect.service.helpers';

describe('connect.service.helpers — account orchestration', () => {
  describe('buildOnboardingAccountUpdate', () => {
    it('returns an empty payload when no field is provided', () => {
      expect(buildOnboardingAccountUpdate({ stripeAccountId: 'acct_test' })).toEqual({});
    });

    it('assembles every section when fully populated', () => {
      const payload = buildOnboardingAccountUpdate({
        stripeAccountId: 'acct_test',
        email: 'seller@example.com',
        country: 'BR',
        businessType: 'individual',
        businessProfile: { name: 'Kloel' },
        individual: { firstName: 'Ada' },
        company: { name: 'Kloel SA' },
        externalAccount: { token: 'btok_1' },
        tosAcceptance: { ipAddress: '203.0.113.1' },
        metadata: { workspaceId: 'ws_1' },
      });
      expect(payload).toEqual({
        email: 'seller@example.com',
        country: 'BR',
        business_type: 'individual',
        business_profile: { name: 'Kloel' },
        individual: { first_name: 'Ada' },
        company: { name: 'Kloel SA' },
        external_account: 'btok_1',
        tos_acceptance: { ip: '203.0.113.1' },
        metadata: { workspaceId: 'ws_1' },
      });
    });

    it('omits sections that resolve to undefined helpers', () => {
      const payload = buildOnboardingAccountUpdate({
        stripeAccountId: 'acct_test',
        email: 'seller@example.com',
        businessProfile: { name: '   ' },
        company: undefined,
      });
      expect(payload).toEqual({ email: 'seller@example.com' });
    });
  });

  describe('buildCreateCustomAccountPayload', () => {
    it('encodes the non-negotiables: custom type + manual payout schedule', () => {
      const payload = buildCreateCustomAccountPayload(
        {
          workspaceId: 'ws_1',
          accountType: 'SELLER',
          email: 'seller@example.com',
        },
        'BR',
      );
      expect(payload).toMatchObject({
        type: 'custom',
        country: 'BR',
        email: 'seller@example.com',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        settings: {
          payouts: { schedule: { interval: 'manual' } },
        },
        metadata: {
          workspaceId: 'ws_1',
          accountType: 'SELLER',
        },
      });
    });

    it('attaches displayName to metadata when provided', () => {
      const payload = buildCreateCustomAccountPayload(
        {
          workspaceId: 'ws_2',
          accountType: 'AFFILIATE',
          email: 'aff@example.com',
          displayName: 'Top Affiliate',
        },
        'BR',
      );
      expect(payload.metadata).toEqual({
        workspaceId: 'ws_2',
        accountType: 'AFFILIATE',
        displayName: 'Top Affiliate',
      });
    });

    it('omits displayName from metadata when not provided', () => {
      const payload = buildCreateCustomAccountPayload(
        {
          workspaceId: 'ws_3',
          accountType: 'SELLER',
          email: 'seller@example.com',
        },
        'US',
      );
      expect(payload.metadata).toEqual({
        workspaceId: 'ws_3',
        accountType: 'SELLER',
      });
      expect(payload.country).toBe('US');
    });
  });

  describe('stripManualPayoutSchedule', () => {
    it('drops the settings block without mutating the source payload', () => {
      const original = buildCreateCustomAccountPayload(
        {
          workspaceId: 'ws_1',
          accountType: 'SELLER',
          email: 'seller@example.com',
        },
        'BR',
      );
      const stripped = stripManualPayoutSchedule(original);
      expect(stripped.settings).toBeUndefined();
      // Original payload must still carry settings — call sites depend on
      // the strip helper being non-destructive so the retry can fall back.
      expect(original.settings).toBeDefined();
      // All other fields preserved.
      expect(stripped.type).toBe('custom');
      expect(stripped.country).toBe('BR');
      expect(stripped.capabilities).toEqual(original.capabilities);
      expect(stripped.metadata).toEqual(original.metadata);
    });
  });

  describe('shouldRetryWithoutManualPayoutSchedule', () => {
    it('returns false for non-BR countries', () => {
      const err = new Error('manual payout plan country BR not supported');
      expect(shouldRetryWithoutManualPayoutSchedule(err, 'US')).toBe(false);
    });

    it('returns true when BR + message mentions manual payout plan + country br', () => {
      const err = new Error(
        'Manual payout plan is not supported for accounts in country BR at this time',
      );
      expect(shouldRetryWithoutManualPayoutSchedule(err, 'BR')).toBe(true);
    });

    it('returns false when BR but message is unrelated', () => {
      const err = new Error('Stripe is currently unavailable');
      expect(shouldRetryWithoutManualPayoutSchedule(err, 'BR')).toBe(false);
    });

    it('extracts message from non-Error objects with string message', () => {
      const err = { message: 'manual payout plan rejected for country BR' };
      expect(shouldRetryWithoutManualPayoutSchedule(err, 'BR')).toBe(true);
    });

    it('returns false when error has no usable message', () => {
      expect(shouldRetryWithoutManualPayoutSchedule(null, 'BR')).toBe(false);
      expect(shouldRetryWithoutManualPayoutSchedule(42, 'BR')).toBe(false);
      expect(shouldRetryWithoutManualPayoutSchedule({ message: 123 }, 'BR')).toBe(false);
    });
  });

  describe('projectOnboardingStatus', () => {
    it('maps requirement arrays + capabilities + booleans', () => {
      const status = projectOnboardingStatus({
        id: 'acct_abc',
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        requirements: {
          currently_due: ['individual.id_number'],
          past_due: ['business_profile.url'],
          disabled_reason: 'requirements.past_due',
        },
        capabilities: { card_payments: 'active', transfers: 'pending' },
      });
      expect(status).toEqual({
        stripeAccountId: 'acct_abc',
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsCurrentlyDue: ['individual.id_number'],
        requirementsPastDue: ['business_profile.url'],
        requirementsDisabledReason: 'requirements.past_due',
        capabilities: { card_payments: 'active', transfers: 'pending' },
      });
    });

    it('defaults requirement arrays to [] when missing or null', () => {
      const status = projectOnboardingStatus({ id: 'acct_xyz' });
      expect(status).toEqual({
        stripeAccountId: 'acct_xyz',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsDisabledReason: null,
        capabilities: {},
      });
    });

    it('coerces non-string capability values via String()', () => {
      const status = projectOnboardingStatus({
        id: 'acct_q',
        capabilities: { card_payments: 1 as unknown as string },
      });
      expect(status.capabilities).toEqual({ card_payments: '1' });
    });
  });
});
