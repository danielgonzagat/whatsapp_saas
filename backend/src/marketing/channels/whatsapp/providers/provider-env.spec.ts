import {
  normalizeWhatsAppProvider,
  resolveDefaultWhatsAppProvider,
  resolveWhatsAppProvider,
} from './provider-env';

describe('provider-env', () => {
  it('rejects legacy WAHA aliases', () => {
    expect(normalizeWhatsAppProvider('whatsapp-api')).toBeNull();
    expect(normalizeWhatsAppProvider('waha')).toBeNull();
    expect(normalizeWhatsAppProvider('whatsapp-web-agent')).toBeNull();
  });

  it('normalizes Meta aliases into meta-cloud', () => {
    expect(normalizeWhatsAppProvider('meta-cloud')).toBe('meta-cloud');
    expect(normalizeWhatsAppProvider('meta')).toBe('meta-cloud');
  });

  it('normalizes with case insensitivity and whitespace', () => {
    expect(normalizeWhatsAppProvider('  WAHA  ')).toBeNull();
    expect(normalizeWhatsAppProvider('  Meta-Cloud  ')).toBe('meta-cloud');
    expect(normalizeWhatsAppProvider('  meta  ')).toBe('meta-cloud');
  });

  it('returns null for unknown, null, empty, and non-string values', () => {
    expect(normalizeWhatsAppProvider('unknown')).toBeNull();
    expect(normalizeWhatsAppProvider(null)).toBeNull();
    expect(normalizeWhatsAppProvider(undefined)).toBeNull();
    expect(normalizeWhatsAppProvider('')).toBeNull();
    expect(normalizeWhatsAppProvider(42)).toBeNull();
    expect(normalizeWhatsAppProvider(true)).toBeNull();
  });

  it('defaults to meta-cloud even when WAHA runtime vars exist without an explicit provider', () => {
    expect(
      resolveDefaultWhatsAppProvider({
        WAHA_API_URL: 'https://waha.kloel.test',
      }),
    ).toBe('meta-cloud');
  });

  it('defaults to meta-cloud when neither WAHA nor an explicit provider is configured', () => {
    expect(resolveDefaultWhatsAppProvider({})).toBe('meta-cloud');
  });

  it('prefers an explicit stored provider over the process default', () => {
    expect(
      resolveWhatsAppProvider('meta-cloud', {
        WAHA_API_URL: 'https://waha.kloel.test',
      }),
    ).toBe('meta-cloud');
  });
});
