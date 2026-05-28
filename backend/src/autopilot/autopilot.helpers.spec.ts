import {
  applyAutopilotConfigPatch,
  buildAutonomyPatch,
  buildAutopilotEnabledPatch,
  buildPostPurchaseMessage,
  coerceFlowIdLabel,
  computeStatusEnabled,
  getPostPurchaseFlowId,
  getWhatsAppApiStatus,
  isBillingSuspended,
  isWhatsAppConnected,
  readRecord,
} from './autopilot.helpers';

describe('autopilot.helpers', () => {
  describe('readRecord', () => {
    it('returns the value when it is a plain object', () => {
      const input = { a: 1 };
      expect(readRecord(input)).toBe(input);
    });

    it('returns {} for null / undefined / primitives / arrays-of-non-objects', () => {
      expect(readRecord(null)).toEqual({});
      expect(readRecord(undefined)).toEqual({});
      expect(readRecord('hi')).toEqual({});
      expect(readRecord(42)).toEqual({});
      expect(readRecord(true)).toEqual({});
    });

    it('treats arrays as records (typeof object) — by design', () => {
      const arr: unknown = [1, 2, 3];
      expect(readRecord(arr)).toBe(arr);
    });
  });

  describe('isBillingSuspended', () => {
    it('returns true only when billingSuspended === true', () => {
      expect(isBillingSuspended({ billingSuspended: true })).toBe(true);
    });

    it('returns false otherwise', () => {
      expect(isBillingSuspended({})).toBe(false);
      expect(isBillingSuspended({ billingSuspended: false })).toBe(false);
      expect(isBillingSuspended({ billingSuspended: 'true' })).toBe(false);
      expect(isBillingSuspended({ billingSuspended: 1 })).toBe(false);
    });
  });

  describe('getWhatsAppApiStatus / isWhatsAppConnected', () => {
    it('extracts the nested whatsappApiSession.status string', () => {
      expect(getWhatsAppApiStatus({ whatsappApiSession: { status: 'connected' } })).toBe(
        'connected',
      );
    });

    it('returns undefined when session/status missing or non-string', () => {
      expect(getWhatsAppApiStatus({})).toBeUndefined();
      expect(getWhatsAppApiStatus({ whatsappApiSession: null })).toBeUndefined();
      expect(getWhatsAppApiStatus({ whatsappApiSession: { status: 42 } })).toBeUndefined();
    });

    it('isWhatsAppConnected true only for exact "connected" string', () => {
      expect(isWhatsAppConnected({ whatsappApiSession: { status: 'connected' } })).toBe(true);
      expect(isWhatsAppConnected({ whatsappApiSession: { status: 'pending' } })).toBe(false);
      expect(isWhatsAppConnected({})).toBe(false);
    });
  });

  describe('buildAutonomyPatch', () => {
    const NOW = '2026-01-01T00:00:00.000Z';

    it('on enable, sets LIVE mode + reactive on + manual_toggle_on reason', () => {
      expect(buildAutonomyPatch({ existing: 'x' }, true, NOW)).toEqual({
        existing: 'x',
        mode: 'LIVE',
        reactiveEnabled: true,
        proactiveEnabled: false,
        reason: 'manual_toggle_on',
        lastTransitionAt: NOW,
      });
    });

    it('on disable, sets OFF + reactive off + manual_toggle_off reason', () => {
      expect(buildAutonomyPatch({}, false, NOW)).toEqual({
        mode: 'OFF',
        reactiveEnabled: false,
        proactiveEnabled: false,
        reason: 'manual_toggle_off',
        lastTransitionAt: NOW,
      });
    });

    it('overrides prior values for managed keys but preserves other keys', () => {
      const prev = { mode: 'BACKLOG', custom: 'keep-me' };
      expect(buildAutonomyPatch(prev, true, NOW)).toEqual({
        custom: 'keep-me',
        mode: 'LIVE',
        reactiveEnabled: true,
        proactiveEnabled: false,
        reason: 'manual_toggle_on',
        lastTransitionAt: NOW,
      });
    });
  });

  describe('buildAutopilotEnabledPatch', () => {
    it('merges enabled onto prior config', () => {
      expect(buildAutopilotEnabledPatch({ currencyDefault: 'BRL' }, true)).toEqual({
        currencyDefault: 'BRL',
        enabled: true,
      });
    });

    it('overrides existing enabled', () => {
      expect(buildAutopilotEnabledPatch({ enabled: true, x: 1 }, false)).toEqual({
        enabled: false,
        x: 1,
      });
    });
  });

  describe('applyAutopilotConfigPatch', () => {
    it('returns a fresh copy when payload is empty', () => {
      const prev = { conversionFlowId: 'f1' };
      const out = applyAutopilotConfigPatch(prev, {});
      expect(out).toEqual(prev);
      expect(out).not.toBe(prev);
    });

    it('overrides conversionFlowId (string) and recoveryTemplateName (null clears)', () => {
      expect(
        applyAutopilotConfigPatch(
          { conversionFlowId: 'old', recoveryTemplateName: 'tpl' },
          { conversionFlowId: 'new', recoveryTemplateName: null },
        ),
      ).toEqual({ conversionFlowId: 'new', recoveryTemplateName: null });
    });

    it('treats undefined as "do not touch"', () => {
      expect(
        applyAutopilotConfigPatch(
          { conversionFlowId: 'kept', recoveryTemplateName: 'kept' },
          { currencyDefault: 'BRL' },
        ),
      ).toEqual({
        conversionFlowId: 'kept',
        recoveryTemplateName: 'kept',
        currencyDefault: 'BRL',
      });
    });

    it('ignores empty-string currencyDefault (truthy guard)', () => {
      expect(
        applyAutopilotConfigPatch({ currencyDefault: 'BRL' }, { currencyDefault: '' }),
      ).toEqual({ currencyDefault: 'BRL' });
    });
  });

  describe('computeStatusEnabled', () => {
    it('true when autonomy.mode is LIVE / BACKLOG / FULL', () => {
      expect(computeStatusEnabled({ autonomy: { mode: 'LIVE' } })).toBe(true);
      expect(computeStatusEnabled({ autonomy: { mode: 'backlog' } })).toBe(true);
      expect(computeStatusEnabled({ autonomy: { mode: 'full' } })).toBe(true);
    });

    it('true when legacy autopilot.enabled is truthy', () => {
      expect(computeStatusEnabled({ autopilot: { enabled: true } })).toBe(true);
    });

    it('false when neither autonomy mode nor legacy flag set', () => {
      expect(computeStatusEnabled({})).toBe(false);
      expect(computeStatusEnabled({ autonomy: { mode: 'OFF' } })).toBe(false);
      expect(computeStatusEnabled({ autopilot: { enabled: false } })).toBe(false);
    });

    it('ignores non-string autonomy.mode', () => {
      expect(computeStatusEnabled({ autonomy: { mode: 123 } })).toBe(false);
    });
  });

  describe('getPostPurchaseFlowId', () => {
    it('returns the configured flowId', () => {
      expect(getPostPurchaseFlowId({ autopilot: { postPurchaseFlowId: 'flow-1' } })).toBe('flow-1');
    });

    it('returns undefined when missing', () => {
      expect(getPostPurchaseFlowId({})).toBeUndefined();
      expect(getPostPurchaseFlowId({ autopilot: {} })).toBeUndefined();
    });
  });

  describe('coerceFlowIdLabel', () => {
    it('echoes strings unchanged', () => {
      expect(coerceFlowIdLabel('abc')).toBe('abc');
    });

    it('returns "unknown" for non-strings', () => {
      expect(coerceFlowIdLabel(undefined)).toBe('unknown');
      expect(coerceFlowIdLabel(null)).toBe('unknown');
      expect(coerceFlowIdLabel(42)).toBe('unknown');
      expect(coerceFlowIdLabel({ id: 'x' })).toBe('unknown');
    });
  });

  describe('buildPostPurchaseMessage', () => {
    it('includes the product name when provided', () => {
      const out = buildPostPurchaseMessage('Curso Pro');
      expect(out).toContain('*Curso Pro*');
      expect(out.startsWith('Obrigado pela sua compra de')).toBe(true);
    });

    it('falls back to the generic message when productName is missing', () => {
      expect(buildPostPurchaseMessage(undefined)).toBe(
        'Obrigado pela sua compra. Seu acesso e os próximos passos seguem pelo canal cadastrado.',
      );
    });
  });
});
