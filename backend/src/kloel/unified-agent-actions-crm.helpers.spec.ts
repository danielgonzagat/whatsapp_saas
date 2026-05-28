import {
  decideChannelFromSettings,
  describeThrown,
  fallbackChannelFromPhone,
  hasAutonomyExecutionClient,
  isDeterministicPipeline,
  isRecord,
} from './unified-agent-actions-crm.helpers';

describe('unified-agent-actions-crm.helpers (pure)', () => {
  describe('isDeterministicPipeline', () => {
    it('returns true only when context.deterministicPipeline is strictly true', () => {
      expect(isDeterministicPipeline({ deterministicPipeline: true })).toBe(true);
      expect(isDeterministicPipeline({ deterministicPipeline: 'true' })).toBe(false);
      expect(isDeterministicPipeline({ deterministicPipeline: 1 })).toBe(false);
      expect(isDeterministicPipeline({})).toBe(false);
      expect(isDeterministicPipeline(undefined)).toBe(false);
    });
  });

  describe('isRecord', () => {
    it('narrows to plain objects (rejects null and primitives)', () => {
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord([])).toBe(true); // arrays are typeof 'object'
      expect(isRecord(null)).toBe(false);
      expect(isRecord('x')).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
    });
  });

  describe('hasAutonomyExecutionClient', () => {
    it('detects the autonomyExecution model only when defined and non-null', () => {
      expect(hasAutonomyExecutionClient({ autonomyExecution: { create: () => {} } })).toBe(true);
      expect(hasAutonomyExecutionClient({ autonomyExecution: null })).toBe(false);
      expect(hasAutonomyExecutionClient({ autonomyExecution: undefined })).toBe(false);
      expect(hasAutonomyExecutionClient({})).toBe(false);
      expect(hasAutonomyExecutionClient(null)).toBe(false);
    });
  });

  describe('describeThrown', () => {
    it('returns Error.message for Error subclasses', () => {
      expect(describeThrown(new Error('boom'))).toBe('boom');
      expect(describeThrown(new TypeError('bad type'))).toBe('bad type');
    });
    it('returns the string itself for string throws', () => {
      expect(describeThrown('rejected literal')).toBe('rejected literal');
    });
    it('returns the fallback for non-Error non-string values', () => {
      expect(describeThrown(42)).toBe('unknown');
      expect(describeThrown(null)).toBe('unknown');
      expect(describeThrown({ code: 'X' })).toBe('unknown');
      expect(describeThrown({ code: 'X' }, 'custom')).toBe('custom');
    });
  });

  describe('decideChannelFromSettings', () => {
    it('prefers whatsapp when provider+connected even without phone or channel identifiers', () => {
      expect(
        decideChannelFromSettings({
          providerSettings: {
            whatsappProvider: 'meta-cloud',
            connectionStatus: 'connected',
          },
          whatsappChannelIdentifierCount: 0,
          phone: '',
        }),
      ).toBe('whatsapp');
    });

    it('chooses whatsapp when phone is E.164 and a whatsapp channel identifier exists', () => {
      expect(
        decideChannelFromSettings({
          providerSettings: { whatsappProvider: null, connectionStatus: 'pending' },
          whatsappChannelIdentifierCount: 1,
          phone: '+5511999999999',
        }),
      ).toBe('whatsapp');
    });

    it('falls back to email when phone has no +, even with a whatsapp identifier present', () => {
      expect(
        decideChannelFromSettings({
          providerSettings: {},
          whatsappChannelIdentifierCount: 1,
          phone: '5511999999999',
        }),
      ).toBe('email');
    });

    it('falls back to email when no provider config and no channel identifiers exist', () => {
      expect(
        decideChannelFromSettings({
          providerSettings: null,
          whatsappChannelIdentifierCount: 0,
          phone: '+5511999999999',
        }),
      ).toBe('email');
    });

    it('falls back to email when phone is empty', () => {
      expect(
        decideChannelFromSettings({
          providerSettings: undefined,
          whatsappChannelIdentifierCount: 2,
          phone: undefined,
        }),
      ).toBe('email');
    });

    it('ignores a non-string whatsappProvider value', () => {
      expect(
        decideChannelFromSettings({
          providerSettings: { whatsappProvider: 1, connectionStatus: 'connected' },
          whatsappChannelIdentifierCount: 0,
          phone: '+5511999',
        }),
      ).toBe('email');
    });
  });

  describe('fallbackChannelFromPhone', () => {
    it('returns whatsapp when the phone is E.164-shaped', () => {
      expect(fallbackChannelFromPhone('+5511999999999')).toBe('whatsapp');
    });
    it('returns email when the phone is missing or not E.164', () => {
      expect(fallbackChannelFromPhone('5511999')).toBe('email');
      expect(fallbackChannelFromPhone('')).toBe('email');
      expect(fallbackChannelFromPhone(null)).toBe('email');
      expect(fallbackChannelFromPhone(undefined)).toBe('email');
    });
  });
});
