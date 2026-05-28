import {
  buildAddress,
  buildBusinessProfile,
  buildCompanyProfile,
  buildCreateCustomAccountPayload,
  buildExternalAccount,
  buildIndividualProfile,
  buildMetadata,
  buildOnboardingAccountUpdate,
  buildTosAcceptance,
  compactObject,
  CONNECT_REQUESTED_CAPABILITIES,
  projectOnboardingStatus,
  shouldRetryWithoutManualPayoutSchedule,
  stripManualPayoutSchedule,
} from './connect.service.helpers';

describe('connect.service.helpers', () => {
  describe('CONNECT_REQUESTED_CAPABILITIES', () => {
    it('requests card_payments and transfers in that order', () => {
      expect(CONNECT_REQUESTED_CAPABILITIES).toEqual(['card_payments', 'transfers']);
    });

    it('is frozen so callers cannot mutate the canonical list', () => {
      expect(Object.isFrozen(CONNECT_REQUESTED_CAPABILITIES)).toBe(true);
    });
  });

  describe('compactObject', () => {
    it('returns undefined when every entry is undefined', () => {
      expect(compactObject({ a: undefined, b: undefined })).toBeUndefined();
    });

    it('drops only undefined entries and keeps defined falsy values', () => {
      const result = compactObject({ a: 0, b: '', c: null, d: undefined, e: false });
      expect(result).toEqual({ a: 0, b: '', c: null, e: false });
    });
  });

  describe('buildAddress', () => {
    it('returns undefined when input is undefined', () => {
      expect(buildAddress(undefined)).toBeUndefined();
    });

    it('returns undefined when every field is blank', () => {
      expect(
        buildAddress({
          line1: '   ',
          line2: '',
          city: '   ',
          state: undefined,
          postalCode: '',
          country: '',
        }),
      ).toBeUndefined();
    });

    it('renames postalCode to postal_code and trims fields', () => {
      expect(
        buildAddress({
          line1: '  Rua A, 123  ',
          line2: '',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '01000-000',
          country: 'BR',
        }),
      ).toEqual({
        line1: 'Rua A, 123',
        city: 'Sao Paulo',
        state: 'SP',
        postal_code: '01000-000',
        country: 'BR',
      });
    });
  });

  describe('buildBusinessProfile', () => {
    it('returns undefined for empty / undefined inputs', () => {
      expect(buildBusinessProfile(undefined)).toBeUndefined();
      expect(
        buildBusinessProfile({
          name: '   ',
          productDescription: '',
        }),
      ).toBeUndefined();
    });

    it('maps camelCase to snake_case fields', () => {
      expect(
        buildBusinessProfile({
          name: 'Kloel',
          url: 'https://kloel.com',
          mcc: '5734',
          productDescription: 'AI marketing',
          supportEmail: 'support@kloel.com',
          supportPhone: '+5511999999999',
          supportUrl: 'https://kloel.com/help',
        }),
      ).toEqual({
        name: 'Kloel',
        url: 'https://kloel.com',
        mcc: '5734',
        product_description: 'AI marketing',
        support_email: 'support@kloel.com',
        support_phone: '+5511999999999',
        support_url: 'https://kloel.com/help',
      });
    });
  });

  describe('buildIndividualProfile', () => {
    it('returns undefined when input is undefined', () => {
      expect(buildIndividualProfile(undefined)).toBeUndefined();
    });

    it('strips CPF non-digits and drops invalid DOB fields', () => {
      const result = buildIndividualProfile({
        firstName: '  Ada  ',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+55 (11) 98888-7777',
        idNumber: '123.456.789-09',
        dateOfBirth: { day: 10, month: Number.NaN, year: 1815 },
        address: { city: 'Sao Paulo', country: 'BR' },
      });
      expect(result).toEqual({
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone: '+55 (11) 98888-7777',
        id_number: '12345678909',
        dob: { day: 10, year: 1815 },
        address: { city: 'Sao Paulo', country: 'BR' },
      });
    });

    it('omits DOB entirely when no field is finite', () => {
      const result = buildIndividualProfile({
        firstName: 'Ada',
        dateOfBirth: { day: undefined, month: undefined, year: undefined },
      });
      expect(result).toEqual({ first_name: 'Ada' });
    });
  });

  describe('buildCompanyProfile', () => {
    it('returns undefined when input is undefined', () => {
      expect(buildCompanyProfile(undefined)).toBeUndefined();
    });

    it('strips CNPJ non-digits and keeps trimmed address', () => {
      expect(
        buildCompanyProfile({
          name: 'Kloel SA',
          taxId: '12.345.678/0001-99',
          phone: '11-9999-8888',
          address: { line1: 'Rua A' },
        }),
      ).toEqual({
        name: 'Kloel SA',
        tax_id: '12345678000199',
        phone: '11-9999-8888',
        address: { line1: 'Rua A' },
      });
    });
  });

  describe('buildExternalAccount', () => {
    it('returns undefined when input is undefined', () => {
      expect(buildExternalAccount(undefined)).toBeUndefined();
    });

    it('returns the trimmed token when present', () => {
      expect(buildExternalAccount({ token: '  btok_123  ' })).toBe('btok_123');
    });

    it('builds a raw bank_account payload with BR/brl defaults when no token', () => {
      const result = buildExternalAccount({
        accountHolderName: 'Ada',
        accountHolderType: 'individual',
        routingNumber: '341-0001',
        accountNumber: '0123456-7',
      });
      expect(result).toEqual({
        object: 'bank_account',
        country: 'BR',
        currency: 'brl',
        account_holder_name: 'Ada',
        account_holder_type: 'individual',
        routing_number: '3410001',
        account_number: '01234567',
      });
    });

    it('lowercases currency and honors provided country', () => {
      const result = buildExternalAccount({
        country: 'US',
        currency: 'USD',
        accountHolderName: 'Ada',
      });
      expect(result).toMatchObject({
        country: 'US',
        currency: 'usd',
        account_holder_name: 'Ada',
        object: 'bank_account',
      });
    });
  });

  describe('buildTosAcceptance', () => {
    it('returns undefined when input is undefined', () => {
      expect(buildTosAcceptance(undefined)).toBeUndefined();
    });

    it('converts ISO acceptance to epoch seconds and trims metadata', () => {
      const isoDate = '2026-01-15T12:00:00.000Z';
      const result = buildTosAcceptance({
        acceptedAt: isoDate,
        ipAddress: '   203.0.113.1   ',
        userAgent: 'kloel-test/1.0',
      });
      expect(result).toEqual({
        date: Math.floor(Date.parse(isoDate) / 1000),
        ip: '203.0.113.1',
        user_agent: 'kloel-test/1.0',
      });
    });

    it('drops the date field when acceptedAt is unparseable', () => {
      const result = buildTosAcceptance({
        acceptedAt: 'not-a-date',
        ipAddress: '203.0.113.1',
      });
      expect(result).toEqual({ ip: '203.0.113.1' });
    });
  });

  describe('buildMetadata', () => {
    it('returns undefined when input is undefined', () => {
      expect(buildMetadata(undefined)).toBeUndefined();
    });

    it('drops empty key/value entries', () => {
      const result = buildMetadata({
        keep: 'value',
        '   ': 'blank-key',
        empty: '   ',
        ok: 'yes',
      });
      expect(result).toEqual({ keep: 'value', ok: 'yes' });
    });

    it('returns undefined when nothing survives filtering', () => {
      expect(buildMetadata({ '': '', '   ': '' })).toBeUndefined();
    });
  });

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
