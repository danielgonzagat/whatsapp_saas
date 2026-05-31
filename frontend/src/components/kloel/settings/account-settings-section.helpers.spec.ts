import { describe, expect, it } from 'vitest';

import {
  type AccountChannels,
  type AccountPreferences,
  type AccountProfile,
  buildAccountSettingsPayload,
  buildUpdateAccountBody,
  buildUpdateChannelsBody,
  coerceJitterInput,
  extractAccountChannels,
  extractAccountPreferences,
  extractAccountProfile,
  firstApiError,
} from './account-settings-section.helpers';

const baseProfile: AccountProfile = {
  name: 'Acme Workspace',
  email: 'owner@acme.com',
  phone: '5511999990000',
  webhookUrl: 'https://acme.com/webhooks/kloel',
  website: 'https://acme.com',
};

const basePreferences: AccountPreferences = {
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  dateFormat: 'DD/MM/YYYY',
  emailImportant: true,
  emailTips: false,
};

const baseChannels: AccountChannels = {
  provider: 'meta-cloud',
  jitterMin: 5,
  jitterMax: 15,
  emailEnabled: false,
};

describe('extractAccountProfile', () => {
  it('reads name from workspace and email from user, with fallbacks', () => {
    const profile = extractAccountProfile(
      { name: 'Acme', customDomain: 'fallback.example' },
      { phone: '5511', webhookUrl: 'https://h.example', website: '' },
      { email: 'owner@acme.com' },
    );
    expect(profile).toEqual({
      name: 'Acme',
      email: 'owner@acme.com',
      phone: '5511',
      webhookUrl: 'https://h.example',
      website: 'fallback.example',
    });
  });

  it('returns empty strings when nothing is provided', () => {
    expect(extractAccountProfile({}, {}, {})).toEqual({
      name: '',
      email: '',
      phone: '',
      webhookUrl: '',
      website: '',
    });
  });

  it('prefers explicit website over customDomain fallback', () => {
    const profile = extractAccountProfile(
      { customDomain: 'fallback.example' },
      { website: 'https://primary.example' },
      {},
    );
    expect(profile.website).toBe('https://primary.example');
  });
});

describe('extractAccountPreferences', () => {
  it('applies conservative defaults when nothing is set', () => {
    expect(extractAccountPreferences({})).toEqual({
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      dateFormat: 'DD/MM/YYYY',
      emailImportant: true,
      emailTips: false,
    });
  });

  it('respects nested notification toggles', () => {
    const prefs = extractAccountPreferences({
      language: 'en-US',
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      notifications: { emailImportant: false, emailTips: true },
    });
    expect(prefs).toEqual({
      language: 'en-US',
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      emailImportant: false,
      emailTips: true,
    });
  });
});

describe('extractAccountChannels', () => {
  it('defaults to meta-cloud with 5/15 jitter when fields are absent', () => {
    expect(extractAccountChannels({}, {}, {})).toEqual({
      provider: 'meta-cloud',
      jitterMin: 5,
      jitterMax: 15,
      emailEnabled: false,
    });
  });

  it('reads provider from settings and jitter from workspace', () => {
    const channels = extractAccountChannels(
      { jitterMin: 8, jitterMax: 20 },
      { whatsappProvider: 'email' },
      { email: true },
    );
    expect(channels).toEqual({
      provider: 'email',
      jitterMin: 8,
      jitterMax: 20,
      emailEnabled: true,
    });
  });

  it('coerces truthy channel data to boolean', () => {
    const channels = extractAccountChannels({}, {}, { email: 'yes' });
    expect(channels.emailEnabled).toBe(true);
  });
});

describe('buildAccountSettingsPayload', () => {
  it('composes profile, preferences and channels from raw API envelopes', () => {
    const payload = buildAccountSettingsPayload(
      {
        name: 'Acme',
        jitterMin: 7,
        jitterMax: 12,
        providerSettings: {
          phone: '5511',
          webhookUrl: 'https://h.example',
          website: 'https://acme.example',
          language: 'es',
          timezone: 'Europe/London',
          dateFormat: 'YYYY-MM-DD',
          whatsappProvider: 'meta-cloud',
          notifications: { emailImportant: false, emailTips: true },
        },
      },
      { user: { email: 'owner@acme.com' } },
      { email: true },
    );

    expect(payload).toEqual({
      profile: {
        name: 'Acme',
        email: 'owner@acme.com',
        phone: '5511',
        webhookUrl: 'https://h.example',
        website: 'https://acme.example',
      },
      preferences: {
        language: 'es',
        timezone: 'Europe/London',
        dateFormat: 'YYYY-MM-DD',
        emailImportant: false,
        emailTips: true,
      },
      channels: {
        provider: 'meta-cloud',
        jitterMin: 7,
        jitterMax: 12,
        emailEnabled: true,
      },
    });
  });

  it('survives null / undefined / wrong-shape inputs without throwing', () => {
    const payload = buildAccountSettingsPayload(null, undefined, undefined);
    expect(payload.profile.name).toBe('');
    expect(payload.preferences.language).toBe('pt-BR');
    expect(payload.channels.provider).toBe('meta-cloud');
    expect(payload.channels.emailEnabled).toBe(false);
  });
});

describe('buildUpdateAccountBody', () => {
  it('maps profile + preferences into the API contract verbatim', () => {
    expect(buildUpdateAccountBody(baseProfile, basePreferences)).toEqual({
      name: 'Acme Workspace',
      phone: '5511999990000',
      webhookUrl: 'https://acme.com/webhooks/kloel',
      website: 'https://acme.com',
      timezone: 'America/Sao_Paulo',
      language: 'pt-BR',
      dateFormat: 'DD/MM/YYYY',
      notifications: { emailImportant: true, emailTips: false },
    });
  });

  it('does not leak the email field (login email is read-only)', () => {
    const body = buildUpdateAccountBody(baseProfile, basePreferences);
    expect(body).not.toHaveProperty('email');
  });

  it('preserves notification toggle state', () => {
    const body = buildUpdateAccountBody(baseProfile, {
      ...basePreferences,
      emailImportant: false,
      emailTips: true,
    });
    expect(body.notifications).toEqual({ emailImportant: false, emailTips: true });
  });
});

describe('buildUpdateChannelsBody', () => {
  it('exposes only the email toggle (provider + jitter use other endpoints)', () => {
    expect(buildUpdateChannelsBody(baseChannels)).toEqual({ email: false });
  });

  it('reflects emailEnabled=true', () => {
    expect(buildUpdateChannelsBody({ ...baseChannels, emailEnabled: true })).toEqual({
      email: true,
    });
  });
});

describe('firstApiError', () => {
  it('returns null when every response is successful', () => {
    expect(firstApiError([{}, { error: null }, { error: undefined }])).toBeNull();
  });

  it('returns the first non-empty error encountered', () => {
    expect(
      firstApiError([{ error: null }, { error: 'provider failed' }, { error: 'jitter failed' }]),
    ).toBe('provider failed');
  });

  it('treats empty-string error as falsy and keeps scanning', () => {
    expect(firstApiError([{ error: '' }, { error: 'channels failed' }])).toBe('channels failed');
  });

  it('returns null on an empty list', () => {
    expect(firstApiError([])).toBeNull();
  });
});

describe('coerceJitterInput', () => {
  it('returns 0 for empty / null / undefined input', () => {
    expect(coerceJitterInput('')).toBe(0);
    expect(coerceJitterInput(null)).toBe(0);
    expect(coerceJitterInput(undefined)).toBe(0);
  });

  it('parses numeric strings', () => {
    expect(coerceJitterInput('5')).toBe(5);
    expect(coerceJitterInput('12.5')).toBe(12.5);
  });

  it('passes through finite numbers', () => {
    expect(coerceJitterInput(7)).toBe(7);
    expect(coerceJitterInput(0)).toBe(0);
  });

  it('falls back to 0 for non-numeric strings', () => {
    expect(coerceJitterInput('abc')).toBe(0);
    expect(coerceJitterInput('NaN')).toBe(0);
  });
});
