import {
  HOT_FLOW_KEYWORDS,
  buildAutopilotScanKey,
  buildContactCustomFieldsPatch,
  buildFlowReplyKey,
  buildInboundDedupeKey,
  collectSenderNameCandidates,
  isHotFlowSignalContent,
  parseContactDebounceMs,
  parseSharedReplyLockMs,
  resolveTrustedContactNameFromCandidates,
  shouldDispatchVoiceTranscription,
  shouldEnqueueFlowContext,
  type InboundRawPayload,
} from './inbound-processor.service.helpers';
import type { InboundMessage } from './inbound-processor.helpers';

function makeMsg(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    workspaceId: 'ws-1',
    provider: 'meta-cloud',
    providerMessageId: 'msg-1',
    from: '+5511999990000',
    type: 'text',
    ...overrides,
  };
}

describe('inbound-processor.service.helpers', () => {
  describe('collectSenderNameCandidates', () => {
    it('returns msg.senderName first, then raw shapes in order', () => {
      const msg = makeMsg({ senderName: 'Maria' });
      const raw: InboundRawPayload = {
        pushName: 'Maria PN',
        notifyName: 'Maria NN',
        _data: { pushName: 'Maria Data PN', notifyName: 'Maria Data NN' },
        message: { pushName: 'Maria Msg PN', notifyName: 'Maria Msg NN' },
        sender: { pushName: 'Maria Sender PN', name: 'Maria Sender N' },
        contact: { pushName: 'Maria Contact PN', name: 'Maria Contact N' },
      };
      const out = collectSenderNameCandidates(msg, raw);
      expect(out[0]).toBe('Maria');
      expect(out[1]).toBe('Maria PN');
      expect(out[2]).toBe('Maria NN');
      expect(out[3]).toBe('Maria Data PN');
      expect(out[10]).toBe('Maria Contact N');
      expect(out).toHaveLength(11);
    });

    it('tolerates raw === null and missing nested objects', () => {
      const out = collectSenderNameCandidates(makeMsg(), null);
      expect(out).toHaveLength(11);
      expect(out.every((v) => v === undefined)).toBe(true);
    });

    it('tolerates raw === undefined', () => {
      const out = collectSenderNameCandidates(makeMsg({ senderName: 'X' }), undefined);
      expect(out[0]).toBe('X');
      expect(out.slice(1).every((v) => v === undefined)).toBe(true);
    });

    it('preserves the missing-nested-field semantics (partial raw)', () => {
      const out = collectSenderNameCandidates(makeMsg(), {
        pushName: 'Only PushName',
      });
      expect(out[1]).toBe('Only PushName');
      expect(out[3]).toBeUndefined();
      expect(out[5]).toBeUndefined();
    });
  });

  describe('resolveTrustedContactNameFromCandidates', () => {
    it('returns the first non-placeholder string', () => {
      const out = resolveTrustedContactNameFromCandidates('+5511999990000', [
        undefined,
        '   ',
        'Maria',
        'Joana',
      ]);
      expect(out).toBe('Maria');
    });

    it('coerces number and boolean candidates', () => {
      const out = resolveTrustedContactNameFromCandidates('+5511999990000', [42, false, 'Maria']);
      expect(out).toBe('42');
    });

    it('skips empty / whitespace-only / null / object candidates', () => {
      const out = resolveTrustedContactNameFromCandidates('+5511999990000', [
        '',
        '   ',
        null,
        { a: 1 },
        ['arr'],
        'Final',
      ]);
      expect(out).toBe('Final');
    });

    it('returns empty string when every candidate is placeholder-like (phone digits)', () => {
      const out = resolveTrustedContactNameFromCandidates('+5511999990000', [
        '5511999990000',
        '+5511999990000',
      ]);
      expect(out).toBe('');
    });

    it('returns empty string when given an empty list', () => {
      expect(resolveTrustedContactNameFromCandidates('+5511999990000', [])).toBe('');
    });
  });

  describe('buildContactCustomFieldsPatch', () => {
    const iso = '2026-05-28T12:34:56.000Z';

    it('starts from an empty object when existing is undefined', () => {
      const out = buildContactCustomFieldsPatch(undefined, 'Maria', iso);
      expect(out.remotePushName).toBe('Maria');
      expect(out.remotePushNameUpdatedAt).toBe(iso);
    });

    it('starts from an empty object when existing is null', () => {
      const out = buildContactCustomFieldsPatch(null, 'Maria', iso);
      expect(out.remotePushName).toBe('Maria');
    });

    it('starts from an empty object when existing is an array', () => {
      const out = buildContactCustomFieldsPatch(['x'], 'Maria', iso);
      const keys = Object.keys(out);
      expect(keys).toContain('remotePushName');
      expect(keys).toContain('remotePushNameUpdatedAt');
      expect(keys).toHaveLength(2);
    });

    it('preserves existing fields when existing is a plain object', () => {
      const out = buildContactCustomFieldsPatch({ city: 'SP', cluster: 'A' }, 'Maria', iso);
      expect(out.city).toBe('SP');
      expect(out.cluster).toBe('A');
      expect(out.remotePushName).toBe('Maria');
      expect(out.remotePushNameUpdatedAt).toBe(iso);
    });

    it('does not mutate the existing object', () => {
      const existing = { city: 'SP', remotePushName: 'Old' };
      const out = buildContactCustomFieldsPatch(existing, 'Maria', iso);
      expect(existing.remotePushName).toBe('Old');
      expect(out.remotePushName).toBe('Maria');
    });
  });

  describe('redis key builders', () => {
    it('buildInboundDedupeKey composes workspaceId + providerMessageId', () => {
      expect(buildInboundDedupeKey('ws-1', 'mid-9')).toBe('inbound:dedupe:ws-1:mid-9');
    });

    it('buildAutopilotScanKey composes workspaceId + contactId', () => {
      expect(buildAutopilotScanKey('ws-1', 'c-1')).toBe('autopilot:scan-contact:ws-1:c-1');
    });

    it('buildFlowReplyKey prefixes reply:', () => {
      expect(buildFlowReplyKey('5511999990000')).toBe('reply:5511999990000');
    });
  });

  describe('isHotFlowSignalContent', () => {
    it('matches every word in HOT_FLOW_KEYWORDS, case-insensitively', () => {
      for (const k of HOT_FLOW_KEYWORDS) {
        expect(isHotFlowSignalContent(`Quero saber sobre ${k.toUpperCase()}.`)).toBe(true);
      }
    });

    it('returns false for unrelated text', () => {
      expect(isHotFlowSignalContent('oi tudo bem')).toBe(false);
      expect(isHotFlowSignalContent('quando voce abre amanha?')).toBe(false);
    });

    it('returns false for null / undefined / empty / whitespace', () => {
      expect(isHotFlowSignalContent(null)).toBe(false);
      expect(isHotFlowSignalContent(undefined)).toBe(false);
      expect(isHotFlowSignalContent('')).toBe(false);
      expect(isHotFlowSignalContent('   ')).toBe(false);
    });

    it('matches when keyword appears as substring of a longer word', () => {
      expect(isHotFlowSignalContent('preco?')).toBe(true);
      expect(isHotFlowSignalContent('boletosss')).toBe(true);
    });
  });

  describe('shouldEnqueueFlowContext', () => {
    it('returns true for live, undefined, and unexpected modes', () => {
      expect(shouldEnqueueFlowContext('live')).toBe(true);
      expect(shouldEnqueueFlowContext(undefined)).toBe(true);
    });

    it('returns false only for catchup', () => {
      expect(shouldEnqueueFlowContext('catchup')).toBe(false);
    });
  });

  describe('shouldDispatchVoiceTranscription', () => {
    it('requires live ingest + audio type + mediaUrl', () => {
      expect(
        shouldDispatchVoiceTranscription({
          type: 'audio',
          mediaUrl: 'https://x/a.ogg',
          ingestMode: 'live',
        }),
      ).toBe(true);
    });

    it('returns true when ingestMode is undefined and other gates pass', () => {
      expect(shouldDispatchVoiceTranscription({ type: 'audio', mediaUrl: 'https://x' })).toBe(true);
    });

    it('returns false for catchup', () => {
      expect(
        shouldDispatchVoiceTranscription({
          type: 'audio',
          mediaUrl: 'https://x',
          ingestMode: 'catchup',
        }),
      ).toBe(false);
    });

    it('returns false for non-audio types', () => {
      expect(
        shouldDispatchVoiceTranscription({
          type: 'text',
          mediaUrl: 'https://x',
          ingestMode: 'live',
        }),
      ).toBe(false);
      expect(
        shouldDispatchVoiceTranscription({
          type: 'image',
          mediaUrl: 'https://x',
          ingestMode: 'live',
        }),
      ).toBe(false);
    });

    it('returns false when mediaUrl is empty / undefined', () => {
      expect(shouldDispatchVoiceTranscription({ type: 'audio', ingestMode: 'live' })).toBe(false);
      expect(
        shouldDispatchVoiceTranscription({
          type: 'audio',
          mediaUrl: '',
          ingestMode: 'live',
        }),
      ).toBe(false);
    });
  });

  describe('parseContactDebounceMs', () => {
    it('uses default when raw is undefined', () => {
      expect(parseContactDebounceMs(undefined)).toBe(2000);
    });

    it('parses a valid integer', () => {
      expect(parseContactDebounceMs('3500')).toBe(3500);
    });

    it('enforces the 500 ms floor', () => {
      expect(parseContactDebounceMs('100')).toBe(500);
    });

    it('treats "0" as invalid and returns the default', () => {
      expect(parseContactDebounceMs('0')).toBe(2000);
    });

    it('falls back to default when raw is unparseable', () => {
      expect(parseContactDebounceMs('not-a-number')).toBe(2000);
    });

    it('honors custom fallback and floor', () => {
      expect(parseContactDebounceMs(undefined, 1000, 250)).toBe(1000);
      expect(parseContactDebounceMs('50', 1000, 250)).toBe(250);
    });
  });

  describe('parseSharedReplyLockMs', () => {
    it('uses default when raw is undefined', () => {
      expect(parseSharedReplyLockMs(undefined)).toBe(45_000);
    });

    it('parses a valid integer', () => {
      expect(parseSharedReplyLockMs('60000')).toBe(60_000);
    });

    it('enforces the 10_000 ms floor', () => {
      expect(parseSharedReplyLockMs('5000')).toBe(10_000);
    });

    it('falls back to default when raw is unparseable', () => {
      expect(parseSharedReplyLockMs('lol')).toBe(45_000);
    });
  });
});
