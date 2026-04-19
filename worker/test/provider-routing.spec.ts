/**
 * ADR 0001 §D7 — worker provider routing test.
 *
 * Before P2-4 the worker hardcoded "meta-cloud" in 6 different files,
 * ignoring whatever WHATSAPP_PROVIDER_DEFAULT the backend was using.
 * After P2-4 every worker code path that needs the provider name
 * calls getWhatsAppProviderFromEnv(), which reads the SAME env var
 * the backend uses (backend/src/whatsapp/providers/provider-registry.ts:46)
 * with the same precedence rules.
 *
 * This test asserts the helper itself respects the env var. The
 * 6 call sites are simple replacements that all funnel through this
 * one function — testing them individually would be redundant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getWhatsAppProviderFromEnv,
  normalizeWhatsAppProvider,
  resolveWhatsAppProvider,
} from '../providers/whatsapp-provider-resolver';

describe('getWhatsAppProviderFromEnv — ADR 0001 §D7', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WHATSAPP_PROVIDER_DEFAULT;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHATSAPP_PROVIDER_DEFAULT;
    } else {
      process.env.WHATSAPP_PROVIDER_DEFAULT = originalEnv;
    }
  });

  it('defaults to meta-cloud when env var is unset', () => {
    delete process.env.WHATSAPP_PROVIDER_DEFAULT;
    expect(getWhatsAppProviderFromEnv()).toBe('meta-cloud');
  });

  it('defaults to meta-cloud when env var is empty', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = '';
    expect(getWhatsAppProviderFromEnv()).toBe('meta-cloud');
  });

  it('returns meta-cloud explicitly when set to meta-cloud', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'meta-cloud';
    expect(getWhatsAppProviderFromEnv()).toBe('meta-cloud');
  });

  it('returns whatsapp-api when set to whatsapp-api', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'whatsapp-api';
    expect(getWhatsAppProviderFromEnv()).toBe('whatsapp-api');
  });

  it('returns whatsapp-api when set to waha (alias)', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'waha';
    expect(getWhatsAppProviderFromEnv()).toBe('whatsapp-api');
  });

  it('is case-insensitive and trims whitespace', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = '  WAHA  ';
    expect(getWhatsAppProviderFromEnv()).toBe('whatsapp-api');
  });

  it('returns meta-cloud for unknown values', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'unknown-provider';
    expect(getWhatsAppProviderFromEnv()).toBe('meta-cloud');
  });
});

describe('resolveWhatsAppProvider — workspace precedence', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WHATSAPP_PROVIDER_DEFAULT;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHATSAPP_PROVIDER_DEFAULT;
    } else {
      process.env.WHATSAPP_PROVIDER_DEFAULT = originalEnv;
    }
  });

  it('normalizes provider aliases the same way as the backend', () => {
    expect(normalizeWhatsAppProvider('meta')).toBe('meta-cloud');
    expect(normalizeWhatsAppProvider('whatsapp-web-agent')).toBe('whatsapp-api');
    expect(normalizeWhatsAppProvider('  WAHA  ')).toBe('whatsapp-api');
  });

  it('prefers the explicit workspace provider over the env default', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'meta-cloud';
    expect(resolveWhatsAppProvider('whatsapp-api')).toBe('whatsapp-api');
  });

  it('falls back to the env default when the workspace value is invalid', () => {
    process.env.WHATSAPP_PROVIDER_DEFAULT = 'whatsapp-api';
    expect(resolveWhatsAppProvider('invalid-provider')).toBe('whatsapp-api');
  });
});
