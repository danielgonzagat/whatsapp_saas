import { describe, expect, it } from 'vitest';

import {
  buildOnboardingHeaders,
  buildOnboardingLoginUrl,
  buildRoleSeedMessage,
  createOnboardingMessage,
  extractSseContent,
  formatMessageTimestamp,
  getOnboardingRoleLabel,
  isOnboardingSwrKey,
  normalizeOnboardingRole,
  ROLE_LABELS,
  safeRandomUUID,
} from './onboarding-chat.helpers';

describe('normalizeOnboardingRole', () => {
  it('returns null for nullish values', () => {
    expect(normalizeOnboardingRole(null)).toBeNull();
    expect(normalizeOnboardingRole('')).toBeNull();
  });

  it('returns null for unknown roles', () => {
    expect(normalizeOnboardingRole('unknown')).toBeNull();
    expect(normalizeOnboardingRole('__proto__')).toBeNull();
  });

  it('returns the role for known values', () => {
    expect(normalizeOnboardingRole('subscriber')).toBe('subscriber');
    expect(normalizeOnboardingRole('producer')).toBe('producer');
    expect(normalizeOnboardingRole('affiliate')).toBe('affiliate');
  });
});

describe('getOnboardingRoleLabel', () => {
  it('translates known roles', () => {
    expect(getOnboardingRoleLabel('subscriber')).toBe(ROLE_LABELS.subscriber);
  });

  it('falls back to the raw role when unknown', () => {
    expect(getOnboardingRoleLabel('mystery')).toBe('mystery');
  });
});

describe('buildRoleSeedMessage', () => {
  it('builds the PT-BR seed sentence', () => {
    expect(buildRoleSeedMessage('produtor')).toBe('Meu perfil inicial no Kloel é: produtor.');
  });
});

describe('safeRandomUUID', () => {
  it('produces a non-empty string id', () => {
    const id = safeRandomUUID();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('produces unique ids across calls', () => {
    const a = safeRandomUUID();
    const b = safeRandomUUID();
    expect(a).not.toBe(b);
  });
});

describe('createOnboardingMessage', () => {
  it('produces a structurally complete message', () => {
    const msg = createOnboardingMessage('user', 'hello');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeInstanceOf(Date);
  });
});

describe('buildOnboardingHeaders', () => {
  it('always sets Content-Type', () => {
    const headers = buildOnboardingHeaders(null) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
  });

  it('appends bearer token when present', () => {
    const headers = buildOnboardingHeaders('abc123') as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer abc123');
  });

  it('ignores empty string tokens', () => {
    const headers = buildOnboardingHeaders('') as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('extractSseContent', () => {
  it('returns null when no data lines exist', () => {
    expect(extractSseContent('event: ping\n')).toBeNull();
  });

  it('returns the latest content field', () => {
    const chunk = `data: ${JSON.stringify({ content: 'partial' })}\ndata: ${JSON.stringify({
      content: 'final',
    })}\n`;
    expect(extractSseContent(chunk)).toBe('final');
  });

  it('survives malformed JSON frames', () => {
    const chunk = `data: not-json\ndata: ${JSON.stringify({ content: 'ok' })}\n`;
    expect(extractSseContent(chunk)).toBe('ok');
  });

  it('ignores non-string content fields', () => {
    const chunk = `data: ${JSON.stringify({ content: 42 })}\n`;
    expect(extractSseContent(chunk)).toBeNull();
  });
});

describe('buildOnboardingLoginUrl', () => {
  it('builds the bare callback when no role is given', () => {
    expect(buildOnboardingLoginUrl(null)).toBe(
      `/login?callbackUrl=${encodeURIComponent('/onboarding-chat')}`,
    );
  });

  it('builds an encoded callback for a known role', () => {
    expect(buildOnboardingLoginUrl('producer')).toBe(
      `/login?callbackUrl=${encodeURIComponent('/onboarding-chat?role=producer')}`,
    );
  });
});

describe('formatMessageTimestamp', () => {
  it('formats a stable PT-BR HH:MM string', () => {
    const stamped = new Date('2026-05-28T03:07:00Z');
    const text = formatMessageTimestamp(stamped);
    expect(text).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('isOnboardingSwrKey', () => {
  it('matches strings under /onboarding', () => {
    expect(isOnboardingSwrKey('/onboarding')).toBe(true);
    expect(isOnboardingSwrKey('/onboarding/status')).toBe(true);
  });

  it('rejects non-onboarding keys', () => {
    expect(isOnboardingSwrKey('/whatsapp')).toBe(false);
    expect(isOnboardingSwrKey(undefined)).toBe(false);
    expect(isOnboardingSwrKey(42)).toBe(false);
  });
});
