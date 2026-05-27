import {
  asProviderSettings,
  type ProviderAutonomySettings,
  type ProviderCiaRuntime,
} from './provider-settings.types';

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

  it('documents autonomy and CIA runtime JSON subcontracts', () => {
    const autonomy = {
      mode: 'sell',
      reactiveEnabled: true,
      proactiveEnabled: false,
    } satisfies ProviderAutonomySettings;
    const ciaRuntime = {
      currentRunId: 'run-1',
      mode: 'backlog',
      autoStarted: true,
    } satisfies ProviderCiaRuntime;

    expect(autonomy.reactiveEnabled).toBe(true);
    expect(ciaRuntime.currentRunId).toBe('run-1');
  });
});
