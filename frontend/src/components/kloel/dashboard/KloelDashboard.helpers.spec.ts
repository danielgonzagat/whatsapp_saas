import { describe, expect, it } from 'vitest';

import {
  capabilityPromptLabel,
  clampVersionIndex,
  computeAttachmentKind,
  computeDrainStep,
  formatBrlCents,
  getGreeting,
  hasDraggedFiles,
  isRecord,
  mapLinkableProducts,
  pickAssistantFeedbackType,
  pickContactDisplayName,
  toErrorMessage,
  toMessageMetadata,
  unwrapApiPayload,
} from './KloelDashboard.helpers';

describe('KloelDashboard.helpers', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord({})).toBe(true);
    });

    it('returns false for arrays, null, undefined, and primitives', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord([])).toBe(false);
      expect(isRecord('x')).toBe(false);
      expect(isRecord(1)).toBe(false);
    });
  });

  describe('unwrapApiPayload', () => {
    it('returns `payload.data` when present', () => {
      expect(unwrapApiPayload<{ id: string }>({ data: { id: 'x' } })).toEqual({ id: 'x' });
    });

    it('returns the payload itself when it is not a record with `data`', () => {
      expect(unwrapApiPayload<number>(42)).toBe(42);
      expect(unwrapApiPayload<unknown[]>([1, 2])).toEqual([1, 2]);
    });
  });

  describe('toMessageMetadata', () => {
    it('returns the record when input is a plain object', () => {
      expect(toMessageMetadata({ k: 'v' })).toEqual({ k: 'v' });
    });

    it('returns null for arrays, primitives, and null', () => {
      expect(toMessageMetadata(null)).toBeNull();
      expect(toMessageMetadata([])).toBeNull();
      expect(toMessageMetadata('foo')).toBeNull();
    });
  });

  describe('toErrorMessage', () => {
    it('uses the Error message when present', () => {
      expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    });

    it('uses the record `.message` when it is a non-blank string', () => {
      expect(toErrorMessage({ message: 'bad' }, 'fb')).toBe('bad');
    });

    it('falls back when message is missing or blank', () => {
      expect(toErrorMessage(new Error('   '), 'fb')).toBe('fb');
      expect(toErrorMessage({}, 'fb')).toBe('fb');
      expect(toErrorMessage(null, 'fb')).toBe('fb');
    });
  });

  describe('capabilityPromptLabel', () => {
    it('returns the greeting prompt when no capability and no messages', () => {
      expect(capabilityPromptLabel(null, false)).toBe('Como posso ajudar você hoje?');
    });

    it('returns the reply prompt when no capability and messages exist', () => {
      expect(capabilityPromptLabel(null, true)).toBe('Responder...');
    });
  });

  describe('hasDraggedFiles', () => {
    it('returns false for null/undefined', () => {
      expect(hasDraggedFiles(null)).toBe(false);
      expect(hasDraggedFiles(undefined)).toBe(false);
    });

    it('returns true when the FileList has entries', () => {
      const dt = { files: [{}, {}], items: [] } as unknown as DataTransfer;
      expect(hasDraggedFiles(dt)).toBe(true);
    });

    it('returns true when every DataTransferItem is of kind=file', () => {
      const dt = {
        files: [],
        items: [{ kind: 'string' }, { kind: 'file' }],
      } as unknown as DataTransfer;
      expect(hasDraggedFiles(dt)).toBe(true);
    });

    it('returns false when no files and no file-kind items', () => {
      const dt = { files: [], items: [{ kind: 'string' }] } as unknown as DataTransfer;
      expect(hasDraggedFiles(dt)).toBe(false);
    });
  });

  describe('getGreeting', () => {
    it('returns one of the four PT-BR greetings', () => {
      expect(['Bom dia', 'Boa tarde', 'Boa noite', 'Boa madrugada']).toContain(getGreeting());
    });
  });

  describe('computeAttachmentKind', () => {
    it('returns image for image/* mimetypes', () => {
      expect(computeAttachmentKind({ type: 'image/png' } as File)).toBe('image');
    });

    it('returns audio for audio/* mimetypes', () => {
      expect(computeAttachmentKind({ type: 'audio/mpeg' } as File)).toBe('audio');
    });

    it('falls back to document for unknown mimetypes', () => {
      expect(computeAttachmentKind({ type: 'application/pdf' } as File)).toBe('document');
      expect(computeAttachmentKind({ type: '' } as File)).toBe('document');
    });
  });

  describe('computeDrainStep', () => {
    it('returns a higher step for larger buffers', () => {
      expect(computeDrainStep(0)).toBe(5);
      expect(computeDrainStep(48)).toBe(5);
      expect(computeDrainStep(49)).toBe(10);
      expect(computeDrainStep(120)).toBe(10);
      expect(computeDrainStep(121)).toBe(18);
      expect(computeDrainStep(281)).toBe(28);
    });
  });

  describe('formatBrlCents', () => {
    it('formats an integer-cent number as BRL with two decimals', () => {
      expect(formatBrlCents(1234)).toBe('R$ 12.34');
      expect(formatBrlCents(0)).toBe('R$ 0.00');
      expect(formatBrlCents(99)).toBe('R$ 0.99');
    });

    it('coerces JSON-ish numeric strings via Number()', () => {
      expect(formatBrlCents('500')).toBe('R$ 5.00');
    });

    it('returns the default dash fallback for non-finite values', () => {
      expect(formatBrlCents(NaN)).toBe('-');
      expect(formatBrlCents(undefined)).toBe('-');
      expect(formatBrlCents('abc')).toBe('-');
    });

    it('respects a caller-supplied fallback', () => {
      expect(formatBrlCents(undefined, 'R$ 0.00')).toBe('R$ 0.00');
      expect(formatBrlCents('abc', 'R$ 0.00')).toBe('R$ 0.00');
    });

    it('treats null as zero (matches legacy Number(null) || 0 contract)', () => {
      expect(formatBrlCents(null)).toBe('R$ 0.00');
    });
  });

  describe('pickContactDisplayName', () => {
    it('prefers `name` when present', () => {
      expect(pickContactDisplayName({ name: 'Alice', phone: '+5511' })).toBe('Alice');
    });

    it('falls back to `phone` when name is missing or blank', () => {
      expect(pickContactDisplayName({ phone: '+5511' })).toBe('+5511');
      expect(pickContactDisplayName({ name: '   ', phone: '+5511' })).toBe('+5511');
    });

    it('returns the default dash fallback for non-records', () => {
      expect(pickContactDisplayName(null)).toBe('-');
      expect(pickContactDisplayName(undefined)).toBe('-');
      expect(pickContactDisplayName('Alice')).toBe('-');
    });

    it('returns the default dash when neither name nor phone is usable', () => {
      expect(pickContactDisplayName({})).toBe('-');
      expect(pickContactDisplayName({ name: '   ', phone: '   ' })).toBe('-');
    });

    it('respects a caller-supplied fallback', () => {
      expect(pickContactDisplayName(null, 'desconhecido')).toBe('desconhecido');
    });
  });

  describe('pickAssistantFeedbackType', () => {
    it('returns the literal type when metadata.feedback.type is positive', () => {
      expect(pickAssistantFeedbackType({ feedback: { type: 'positive' } })).toBe('positive');
    });

    it('returns the literal type when metadata.feedback.type is negative', () => {
      expect(pickAssistantFeedbackType({ feedback: { type: 'negative' } })).toBe('negative');
    });

    it('returns null for every other feedback.type value', () => {
      expect(pickAssistantFeedbackType({ feedback: { type: 'meh' } })).toBeNull();
      expect(pickAssistantFeedbackType({ feedback: { type: 42 } })).toBeNull();
    });

    it('returns null when feedback is missing or non-record', () => {
      expect(pickAssistantFeedbackType(null)).toBeNull();
      expect(pickAssistantFeedbackType(undefined)).toBeNull();
      expect(pickAssistantFeedbackType({})).toBeNull();
      expect(pickAssistantFeedbackType({ feedback: 'positive' })).toBeNull();
    });
  });

  describe('clampVersionIndex', () => {
    it('returns 0 when total is 0', () => {
      expect(clampVersionIndex(0, 0)).toBe(0);
      expect(clampVersionIndex(5, 0)).toBe(0);
      expect(clampVersionIndex(-1, 0)).toBe(0);
    });

    it('clamps to [0, total - 1]', () => {
      expect(clampVersionIndex(0, 3)).toBe(0);
      expect(clampVersionIndex(2, 3)).toBe(2);
      expect(clampVersionIndex(99, 3)).toBe(2);
    });

    it('returns 0 for negative or non-finite candidates', () => {
      expect(clampVersionIndex(-5, 3)).toBe(0);
      expect(clampVersionIndex(NaN, 3)).toBe(0);
      expect(clampVersionIndex(Infinity, 3)).toBe(0);
    });
  });

  describe('mapLinkableProducts', () => {
    it('maps owned products into the linkable shape', () => {
      const result = mapLinkableProducts({
        owned: {
          products: [
            { id: 'p1', name: 'Ebook', status: 'PUBLISHED', category: 'Educação' },
            { id: 'p2', name: '   ', active: true },
          ],
        },
        affiliate: null,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'p1',
        source: 'owned',
        name: 'Ebook',
        status: 'published',
        subtitle: 'Educação',
      });
      expect(result[1]).toMatchObject({
        id: 'p2',
        source: 'owned',
        name: 'Produto sem nome',
        status: 'published',
      });
    });

    it('maps approved affiliate products through both `items` and `products` keys', () => {
      const result = mapLinkableProducts({
        owned: null,
        affiliate: {
          items: [
            {
              id: 'req1',
              status: 'APPROVED',
              affiliateProductId: 'aff1',
              affiliateProduct: {
                id: 'aff1',
                name: 'Curso',
                category: 'Marketplace',
                thumbnailUrl: 'https://example.com/thumb.png',
              },
            },
            { id: 'req2', status: 'PENDING' },
          ],
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'aff1',
        source: 'affiliate',
        name: 'Curso',
        status: 'affiliate',
        imageUrl: 'https://example.com/thumb.png',
        subtitle: 'Marketplace',
      });
    });

    it('returns an empty list when both owned and affiliate are null', () => {
      expect(mapLinkableProducts({ owned: null, affiliate: null })).toEqual([]);
    });
  });
});
