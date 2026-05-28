import {
  buildFollowUpJobId,
  coerceArgNumber,
  coerceArgString,
  computeFollowUpDedupeFloor,
  computeFollowUpScheduledFor,
  computeTicketRiskFromPriority,
  decideChannelFromSettings,
  describeThrown,
  fallbackChannelFromPhone,
  FOLLOW_UP_DEDUPE_WINDOW_MS,
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

  describe('coerceArgString', () => {
    it('returns the input verbatim for string values (including empty)', () => {
      expect(coerceArgString('hello')).toBe('hello');
      expect(coerceArgString('')).toBe('');
    });
    it('stringifies numbers and booleans', () => {
      expect(coerceArgString(42)).toBe('42');
      expect(coerceArgString(0)).toBe('0');
      expect(coerceArgString(true)).toBe('true');
      expect(coerceArgString(false)).toBe('false');
    });
    it('returns the fallback for non-primitive / nullish values', () => {
      expect(coerceArgString(null)).toBe('');
      expect(coerceArgString(undefined)).toBe('');
      expect(coerceArgString({ a: 1 })).toBe('');
      expect(coerceArgString([1, 2])).toBe('');
      expect(coerceArgString(undefined, 'fb')).toBe('fb');
    });
  });

  describe('coerceArgNumber', () => {
    it('returns finite numbers verbatim', () => {
      expect(coerceArgNumber(0)).toBe(0);
      expect(coerceArgNumber(42)).toBe(42);
      expect(coerceArgNumber(-3.14)).toBe(-3.14);
    });
    it('parses numeric strings via Number()', () => {
      expect(coerceArgNumber('24')).toBe(24);
      expect(coerceArgNumber('3.5')).toBe(3.5);
    });
    it('returns the fallback for non-finite / non-numeric values', () => {
      expect(coerceArgNumber('not a number')).toBe(0);
      expect(coerceArgNumber(null)).toBe(0);
      expect(coerceArgNumber({})).toBe(0);
      expect(coerceArgNumber(NaN)).toBe(0);
      expect(coerceArgNumber(Infinity)).toBe(0);
      expect(coerceArgNumber(undefined, 99)).toBe(99);
    });
  });

  describe('computeFollowUpDedupeFloor', () => {
    it('returns a date five minutes earlier than the supplied now', () => {
      const now = Date.UTC(2026, 0, 1, 12, 0, 0);
      expect(computeFollowUpDedupeFloor(now).getTime()).toBe(now - 5 * 60 * 1000);
    });
    it('exports the window constant in milliseconds', () => {
      expect(FOLLOW_UP_DEDUPE_WINDOW_MS).toBe(5 * 60 * 1000);
    });
  });

  describe('computeFollowUpScheduledFor', () => {
    it('adds delayHours hours to now and returns a Date', () => {
      const now = Date.UTC(2026, 0, 1, 12, 0, 0);
      const scheduled = computeFollowUpScheduledFor(now, 24);
      expect(scheduled.getTime()).toBe(now + 24 * 60 * 60 * 1000);
    });
    it('supports fractional delay hours', () => {
      const now = 0;
      expect(computeFollowUpScheduledFor(now, 0.5).getTime()).toBe(30 * 60 * 1000);
    });
  });

  describe('buildFollowUpJobId', () => {
    it('concatenates the canonical followup_<ws>_<contact>_<ts> shape', () => {
      expect(buildFollowUpJobId('ws-1', 'c-2', 1700000000000)).toBe(
        'followup_ws-1_c-2_1700000000000',
      );
    });
  });

  describe('computeTicketRiskFromPriority', () => {
    it('returns the high-risk score for urgent/high', () => {
      expect(computeTicketRiskFromPriority('urgent')).toBe(0.8);
      expect(computeTicketRiskFromPriority('high')).toBe(0.8);
    });
    it('returns the default score for every other label', () => {
      expect(computeTicketRiskFromPriority('normal')).toBe(0.35);
      expect(computeTicketRiskFromPriority('low')).toBe(0.35);
      expect(computeTicketRiskFromPriority('')).toBe(0.35);
      expect(computeTicketRiskFromPriority('HIGH')).toBe(0.35);
    });
  });
});
