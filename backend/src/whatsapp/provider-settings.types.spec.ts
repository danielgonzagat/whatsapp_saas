import { asProviderSettings } from './provider-settings.types';

describe('asProviderSettings', () => {
  it('returns object values as-is', () => {
    const settings = { whatsappProvider: 'meta', connectionStatus: 'CONNECTED' };
    expect(asProviderSettings(settings)).toBe(settings);
  });

  it('returns empty object for null', () => {
    expect(asProviderSettings(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(asProviderSettings(undefined)).toEqual({});
  });

  it('returns empty object for arrays', () => {
    expect(asProviderSettings([1, 2, 3])).toEqual({});
  });

  it('returns empty object for primitives', () => {
    expect(asProviderSettings('hello')).toEqual({});
    expect(asProviderSettings(42)).toEqual({});
    expect(asProviderSettings(true)).toEqual({});
  });
});
