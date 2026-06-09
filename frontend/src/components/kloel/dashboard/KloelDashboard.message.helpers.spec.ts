import { describe, expect, it } from 'vitest';

import {
  buildRevenueSummaryRows,
  canSubmitUserEdit,
  computeEditTextareaRows,
  getBrainIntent,
  getBrainResult,
  getBrainResultData,
  hasBrainFallback,
  hasBrainOperator,
  isConversationStatusClosed,
  mapContactRow,
  mapConversationRow,
  mapProductRow,
  readSendMessageInfo,
  resolveVisibleAssistantText,
  shouldShowAssistantActions,
  shouldShowLiveProcessingTimeline,
  toRecordArray,
} from './KloelDashboard.message.helpers';

describe('KloelDashboard.message.helpers', () => {
  describe('getBrainIntent', () => {
    it('returns the brainIntent string when present', () => {
      expect(getBrainIntent({ brainIntent: 'list_products' })).toBe('list_products');
    });

    it('returns empty string when brainIntent is missing or non-string', () => {
      expect(getBrainIntent({})).toBe('');
      expect(getBrainIntent({ brainIntent: 42 })).toBe('');
      expect(getBrainIntent({ brainIntent: null })).toBe('');
    });
  });

  describe('getBrainResult', () => {
    it('returns the brainResult record when present', () => {
      const result = { data: [1, 2, 3] };
      expect(getBrainResult({ brainResult: result })).toBe(result);
    });

    it('returns null when brainResult is missing or not an object', () => {
      expect(getBrainResult({})).toBeNull();
      expect(getBrainResult({ brainResult: 'oops' })).toBeNull();
      expect(getBrainResult({ brainResult: [1] })).toBeNull();
      expect(getBrainResult({ brainResult: null })).toBeNull();
    });
  });

  describe('getBrainResultData', () => {
    it('returns the data field of a brainResult', () => {
      expect(getBrainResultData({ brainResult: { data: [1, 2] } })).toEqual([1, 2]);
    });

    it('returns undefined when brainResult or data are missing', () => {
      expect(getBrainResultData({})).toBeUndefined();
      expect(getBrainResultData({ brainResult: {} })).toBeUndefined();
    });
  });

  describe('toRecordArray', () => {
    it('returns the input when it is already an array', () => {
      const input = [{ a: 1 }, { b: 2 }];
      expect(toRecordArray(input)).toEqual(input);
    });

    it('returns an empty array for non-array inputs', () => {
      expect(toRecordArray(null)).toEqual([]);
      expect(toRecordArray(undefined)).toEqual([]);
      expect(toRecordArray('foo')).toEqual([]);
      expect(toRecordArray({ a: 1 })).toEqual([]);
    });
  });

  describe('hasBrainOperator / hasBrainFallback', () => {
    it('reflects truthiness of flags', () => {
      expect(hasBrainOperator({ brainOperator: true })).toBe(true);
      expect(hasBrainOperator({ brainOperator: 0 })).toBe(false);
      expect(hasBrainOperator({})).toBe(false);

      expect(hasBrainFallback({ brainFallback: true })).toBe(true);
      expect(hasBrainFallback({ brainFallback: '' })).toBe(false);
      expect(hasBrainFallback({})).toBe(false);
    });
  });

  describe('mapProductRow', () => {
    it('extracts name/price/active with safe defaults', () => {
      expect(mapProductRow({ name: 'Alpha', price: 1990, active: true })).toEqual({
        name: 'Alpha',
        price: 1990,
        active: true,
      });
    });

    it('falls back to "-" name and false active when missing', () => {
      expect(mapProductRow({})).toEqual({ name: '-', price: undefined, active: false });
    });
  });

  describe('mapContactRow', () => {
    it('extracts contact fields stringified', () => {
      expect(
        mapContactRow({ name: 'Maria', phone: '+5511', email: 'a@b.com', leadScore: 87 }),
      ).toEqual({ name: 'Maria', phone: '+5511', email: 'a@b.com', leadScore: '87' });
    });

    it('omits optional fields when falsy', () => {
      expect(mapContactRow({ name: 'X', phone: '' })).toEqual({
        name: 'X',
        phone: '',
        email: '',
        leadScore: '',
      });
    });
  });

  describe('mapConversationRow', () => {
    it('extracts preview (truncated to 80 chars) and agent name when present', () => {
      const longPreview = 'a'.repeat(120);
      const row = mapConversationRow({
        contact: { name: 'Joao' },
        lastMessagePreview: longPreview,
        status: 'open',
        agent: { name: 'Bot' },
      });
      expect(row.preview).toHaveLength(80);
      expect(row.preview).toBe('a'.repeat(80));
      expect(row.status).toBe('open');
      expect(row.agentName).toBe('Bot');
      expect(row.contact).toEqual({ name: 'Joao' });
    });

    it('falls back to "-" status and empty agentName when missing', () => {
      const row = mapConversationRow({});
      expect(row.status).toBe('-');
      expect(row.agentName).toBe('');
      expect(row.preview).toBe('');
    });
  });

  describe('isConversationStatusClosed', () => {
    it('returns true only for the literal "closed" status', () => {
      expect(isConversationStatusClosed('closed')).toBe(true);
      expect(isConversationStatusClosed('open')).toBe(false);
      expect(isConversationStatusClosed('-')).toBe(false);
    });
  });

  describe('buildRevenueSummaryRows', () => {
    it('returns six labelled rows in the expected order', () => {
      const stub = (value: unknown, fallback?: string) =>
        value == null ? (fallback ?? '-') : `R$ ${value}`;
      const rows = buildRevenueSummaryRows(
        {
          totalRevenue: 10000,
          ticketMedio: 250,
          totalCount: 40,
          paidCount: 32,
          conversao: 80,
          periodDays: 7,
        },
        stub,
      );

      expect(rows).toEqual([
        { label: 'Receita Total', value: 'R$ 10000' },
        { label: 'Ticket Medio', value: 'R$ 250' },
        { label: 'Total de Pedidos', value: '40' },
        { label: 'Pedidos Pagos', value: '32' },
        { label: 'Conversao', value: '80%' },
        { label: 'Periodo', value: '7 dias' },
      ]);
    });

    it('applies safe defaults when fields are missing', () => {
      const stub = (value: unknown, fallback?: string) =>
        value == null ? (fallback ?? '-') : String(value);
      const rows = buildRevenueSummaryRows({}, stub);
      expect(rows.map((r) => r.value)).toEqual(['R$ 0.00', 'R$ 0.00', '0', '0', '0%', '30 dias']);
    });
  });

  describe('readSendMessageInfo', () => {
    it('extracts phone/channel/preview from a payload record', () => {
      expect(
        readSendMessageInfo({ phone: '+5511', channel: 'whatsapp', messagePreview: 'oi' }),
      ).toEqual({ phone: '+5511', channel: 'whatsapp', preview: 'oi' });
    });

    it('falls back to "-" phone and default channel when data is non-record', () => {
      expect(readSendMessageInfo(null)).toEqual({
        phone: '-',
        channel: 'whatsapp',
        preview: '',
      });
      expect(readSendMessageInfo('nope')).toEqual({
        phone: '-',
        channel: 'whatsapp',
        preview: '',
      });
    });
  });

  describe('resolveVisibleAssistantText', () => {
    it('returns the content of the active version when available', () => {
      const versions = [{ content: 'first' }, { content: 'second' }];
      expect(resolveVisibleAssistantText(versions, 1, 'fallback')).toBe('second');
    });

    it('falls back when the slot is missing or empty', () => {
      expect(resolveVisibleAssistantText([], 0, 'fallback')).toBe('fallback');
      expect(resolveVisibleAssistantText([{ content: '' }], 0, 'fallback')).toBe('fallback');
      expect(resolveVisibleAssistantText([{ content: null }], 0, 'fallback')).toBe('fallback');
    });

    it('sanitizes direct fallback text before rendering assistant messages', () => {
      const text = resolveVisibleAssistantText(
        [],
        0,
        'A skill recuperação de checkout existe no contexto com , mas , , , `. code_outline backend/src/x.ts TypeScript 11 símbolos.',
      );

      expect(text).toContain('habilidade de recuperação de checkout');
      expect(text).toContain('code_outline');
      expect(text).not.toContain('skill recuperação');
      expect(text).not.toContain('backend/src');
      expect(text).not.toContain('TypeScript');
      expect(text).not.toContain('símbolos');
    });
  });

  describe('computeEditTextareaRows', () => {
    it('returns 3 for very short text', () => {
      expect(computeEditTextareaRows('hi')).toBe(3);
      expect(computeEditTextareaRows('')).toBe(3);
    });

    it('grows with the number of newlines up to 10', () => {
      expect(computeEditTextareaRows('a\nb\nc\nd\ne')).toBe(6); // 5 lines + 1
      expect(computeEditTextareaRows('a\n'.repeat(20))).toBe(10);
    });
  });

  describe('canSubmitUserEdit', () => {
    it('allows submission when text changed and not busy', () => {
      expect(canSubmitUserEdit(false, 'novo texto', 'antigo')).toBe(true);
    });

    it('blocks when busy', () => {
      expect(canSubmitUserEdit(true, 'novo', 'antigo')).toBe(false);
    });

    it('blocks when draft is empty/whitespace', () => {
      expect(canSubmitUserEdit(false, '   ', 'antigo')).toBe(false);
      expect(canSubmitUserEdit(false, '', 'antigo')).toBe(false);
    });

    it('blocks when trimmed text equals current', () => {
      expect(canSubmitUserEdit(false, '  oi  ', 'oi')).toBe(false);
    });
  });

  describe('shouldShowAssistantActions / shouldShowLiveProcessingTimeline', () => {
    it('actions render only when not thinking and there is visible text', () => {
      expect(shouldShowAssistantActions(false, true)).toBe(true);
      expect(shouldShowAssistantActions(true, true)).toBe(false);
      expect(shouldShowAssistantActions(false, false)).toBe(false);
    });

    it('live processing timeline renders only while processing with no visible text', () => {
      expect(shouldShowLiveProcessingTimeline(true, false)).toBe(true);
      expect(shouldShowLiveProcessingTimeline(true, true)).toBe(false);
      expect(shouldShowLiveProcessingTimeline(false, false)).toBe(false);
    });
  });
});
