import {
  normalizeWhatsAppProvider,
  resolveDefaultWhatsAppProvider,
  resolveWhatsAppProvider,
} from './provider-env';

describe('provider-env', () => {
  it('normalizes WAHA aliases into whatsapp-api', () => {
    expect(normalizeWhatsAppProvider('whatsapp-api')).toBe('whatsapp-api');
    expect(normalizeWhatsAppProvider('waha')).toBe('whatsapp-api');
    expect(normalizeWhatsAppProvider('whatsapp-web-agent')).toBe('whatsapp-api');
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
