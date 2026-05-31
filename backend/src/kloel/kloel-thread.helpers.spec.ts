import { Prisma } from '@prisma/client';
import { matchInstance } from '../../test/helpers/match-instance';
import {
  appendStoredProcessingTraceEntry,
  buildProcessingTraceSummary,
  buildStoredProcessingTraceEntry,
  buildStoredResponseVersions,
  buildThreadMessageMetadata,
  buildThreadSummarySystemMessage,
  formatTraceToolLabel,
  lowercaseLeadingCharacter,
  normalizeThreadMessageMetadataRecord,
  resolveClientRequestId,
  type StoredProcessingTraceEntry,
} from './kloel-thread.helpers';
import { type KloelStreamEvent } from './kloel-stream-events';

describe('kloel-thread.helpers', () => {
  describe('normalizeThreadMessageMetadataRecord', () => {
    it('returns empty object for null/undefined', () => {
      expect(normalizeThreadMessageMetadataRecord(null)).toEqual({});
      expect(normalizeThreadMessageMetadataRecord(undefined)).toEqual({});
    });

    it('returns empty object for arrays and primitives', () => {
      expect(normalizeThreadMessageMetadataRecord([])).toEqual({});
      expect(normalizeThreadMessageMetadataRecord('not-an-object')).toEqual({});
      expect(normalizeThreadMessageMetadataRecord(42)).toEqual({});
    });

    it('returns a shallow copy of a plain object', () => {
      const input = { a: 1, b: 'two', c: { nested: true } } as unknown as Prisma.JsonValue;
      const out = normalizeThreadMessageMetadataRecord(input);
      expect(out).toEqual({ a: 1, b: 'two', c: { nested: true } });
      // mutating the result should NOT mutate the source
      out.a = 999;
      expect((input as Record<string, unknown>).a).toBe(1);
    });
  });

  describe('buildThreadMessageMetadata', () => {
    it('returns undefined when both base and extras are empty', () => {
      expect(buildThreadMessageMetadata()).toBeUndefined();
      expect(buildThreadMessageMetadata({}, {})).toBeUndefined();
    });

    it('strips undefined extras and merges with base', () => {
      const base = { a: 1 } as unknown as Prisma.InputJsonValue;
      const out = buildThreadMessageMetadata(base, { b: 2, drop: undefined, c: null });
      expect(out).toEqual({ a: 1, b: 2, c: null });
    });

    it('extras override base on key collision', () => {
      const base = { a: 1, b: 2 } as unknown as Prisma.InputJsonValue;
      const out = buildThreadMessageMetadata(base, { b: 99 });
      expect(out).toEqual({ a: 1, b: 99 });
    });

    it('treats non-object base as empty', () => {
      const out = buildThreadMessageMetadata('garbage', {
        ok: true,
      });
      expect(out).toEqual({ ok: true });
    });
  });

  describe('buildStoredResponseVersions', () => {
    it('returns [] on blank metadata + blank fallback', () => {
      expect(buildStoredResponseVersions(null)).toEqual([]);
      expect(buildStoredResponseVersions(null, '   ')).toEqual([]);
    });

    it('synthesizes a fallback entry when no versions present', () => {
      const out = buildStoredResponseVersions(null, 'hello world', 'v-7');
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 'v-7',
        content: 'hello world',
        source: 'initial',
      });
      expect(typeof out[0]!.createdAt).toBe('string');
    });

    it('synthesizes an id when fallback id is omitted', () => {
      const before = Date.now();
      const out = buildStoredResponseVersions(null, 'content');
      const after = Date.now();
      expect(out).toHaveLength(1);
      expect(out[0]!.id.startsWith('resp_')).toBe(true);
      const ts = Number(out[0]!.id.slice('resp_'.length));
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('parses well-formed responseVersions, skipping bad entries', () => {
      const metadata = {
        responseVersions: [
          { id: 'a', content: 'first', createdAt: '2025-01-01T00:00:00Z', source: 'initial' },
          { id: 'b', content: 'second', source: 'regenerated' }, // no createdAt
          null, // dropped
          'oops', // dropped
          { content: '   ' }, // blank dropped
          { id: 'd', content: 'fourth', source: 'unknown' }, // source normalized to initial
        ],
      } as unknown as Prisma.JsonValue;
      const out = buildStoredResponseVersions(metadata);
      expect(out.map((v) => ({ id: v.id, source: v.source, content: v.content }))).toEqual([
        { id: 'a', source: 'initial', content: 'first' },
        { id: 'b', source: 'regenerated', content: 'second' },
        { id: 'd', source: 'initial', content: 'fourth' },
      ]);
    });

    it('synthesizes id from createdAt when entry id missing', () => {
      const metadata = {
        responseVersions: [{ content: 'hi', createdAt: '2025-06-01T00:00:00Z' }],
      } as unknown as Prisma.JsonValue;
      const out = buildStoredResponseVersions(metadata);
      expect(out[0]!.id).toBe('resp_2025-06-01T00:00:00Z');
    });
  });

  describe('lowercaseLeadingCharacter', () => {
    it('returns input unchanged when empty', () => {
      expect(lowercaseLeadingCharacter('')).toBe('');
    });

    it('lowercases only the first character', () => {
      expect(lowercaseLeadingCharacter('Hello World')).toBe('hello World');
      expect(lowercaseLeadingCharacter('ABC')).toBe('aBC');
    });

    it('is idempotent on already-lowercase input', () => {
      expect(lowercaseLeadingCharacter('lower')).toBe('lower');
    });
  });

  describe('formatTraceToolLabel', () => {
    it('replaces separators with spaces and lowercases each word', () => {
      expect(formatTraceToolLabel('Send_Whatsapp-Message')).toBe('send whatsapp message');
    });

    it('collapses contiguous whitespace and dashes', () => {
      expect(formatTraceToolLabel('foo   bar---baz')).toBe('foo bar baz');
    });

    it('falls back to "ferramenta" when input is null/undefined/blank', () => {
      expect(formatTraceToolLabel(null)).toBe('ferramenta');
      expect(formatTraceToolLabel(undefined)).toBe('ferramenta');
      expect(formatTraceToolLabel('')).toBe('ferramenta');
    });

    it('falls back to "a ferramenta" when input collapses to empty after trim', () => {
      // whitespace-only input is truthy so `||` fallback does not apply; the
      // post-trim empty string triggers the explicit "a ferramenta" branch
      expect(formatTraceToolLabel('   ')).toBe('a ferramenta');
    });
  });

  describe('buildStoredProcessingTraceEntry', () => {
    it('returns null for status events with blank message', () => {
      const event: KloelStreamEvent = {
        type: 'status',
        phase: 'thinking',
        message: '   ',
      } as KloelStreamEvent;
      expect(buildStoredProcessingTraceEntry(event)).toBeNull();
    });

    it('builds a status entry, mapping streaming_token → streaming', () => {
      const event = {
        type: 'status',
        phase: 'streaming_token',
        message: 'Pensando...',
      } as unknown as KloelStreamEvent;
      const out = buildStoredProcessingTraceEntry(event);
      expect(out).not.toBeNull();
      expect(out!.kind).toBe('status');
      expect(out!.phase).toBe('streaming');
      expect(out!.label).toBe('Pensando...');
      expect(out!.id.startsWith('trace_streaming_')).toBe(true);
    });

    it('builds a tool_call entry with formatted label and respects callId', () => {
      const event = {
        type: 'tool_call',
        callId: 'call-1',
        tool: 'send_whatsapp_message',
      } as unknown as KloelStreamEvent;
      const out = buildStoredProcessingTraceEntry(event);
      expect(out).toEqual({
        id: 'call-1',
        kind: 'tool_call',
        phase: 'tool_calling',
        label: 'Executando send whatsapp message.',
        createdAt: matchInstance(String),
        tool: 'send_whatsapp_message',
      });
    });

    it('builds a tool_result success and failure label', () => {
      const ok = buildStoredProcessingTraceEntry({
        type: 'tool_result',
        callId: 'c1',
        tool: 'lookup_lead',
        success: true,
      } as unknown as KloelStreamEvent);
      expect(ok?.label).toBe('Concluiu lookup lead.');
      expect(ok?.success).toBe(true);

      const ko = buildStoredProcessingTraceEntry({
        type: 'tool_result',
        tool: 'lookup_lead',
        success: false,
      } as unknown as KloelStreamEvent);
      expect(ko?.label).toBe('Falhou ao executar lookup lead.');
      expect(ko?.success).toBe(false);
      expect(ko?.id.startsWith('trace_tool_result_')).toBe(true);
    });

    it('returns null for unknown event types', () => {
      const out = buildStoredProcessingTraceEntry({ type: 'noop' } as unknown as KloelStreamEvent);
      expect(out).toBeNull();
    });
  });

  describe('appendStoredProcessingTraceEntry', () => {
    function statusEvent(message: string): KloelStreamEvent {
      return { type: 'status', phase: 'thinking', message } as unknown as KloelStreamEvent;
    }

    it('is a no-op when the event yields no entry', () => {
      const entries: StoredProcessingTraceEntry[] = [];
      appendStoredProcessingTraceEntry(entries, statusEvent(''));
      expect(entries).toEqual([]);
    });

    it('dedups consecutive identical entries by phase+label+kind', () => {
      const entries: StoredProcessingTraceEntry[] = [];
      appendStoredProcessingTraceEntry(entries, statusEvent('A'));
      appendStoredProcessingTraceEntry(entries, statusEvent('A'));
      appendStoredProcessingTraceEntry(entries, statusEvent('B'));
      expect(entries.map((e) => e.label)).toEqual(['A', 'B']);
    });

    it('caps the buffer at 16 entries', () => {
      const entries: StoredProcessingTraceEntry[] = [];
      for (let i = 0; i < 20; i++) {
        appendStoredProcessingTraceEntry(entries, statusEvent(`msg-${i}`));
      }
      expect(entries).toHaveLength(16);
      expect(entries[0]!.label).toBe('msg-4');
      expect(entries[15]!.label).toBe('msg-19');
    });
  });

  describe('buildProcessingTraceSummary', () => {
    function entry(label: string): StoredProcessingTraceEntry {
      return {
        id: 'x',
        kind: 'status',
        phase: 'thinking',
        label,
        createdAt: new Date().toISOString(),
      };
    }

    it('returns undefined when no usable labels', () => {
      expect(buildProcessingTraceSummary([])).toBeUndefined();
      expect(buildProcessingTraceSummary([entry('   ')])).toBeUndefined();
    });

    it('returns "First." for a single label', () => {
      expect(buildProcessingTraceSummary([entry('Pensando')])).toBe('Pensando.');
    });

    it('joins two labels with " e " and lowercases the second', () => {
      expect(buildProcessingTraceSummary([entry('Pensando'), entry('Buscando dados')])).toBe(
        'Pensando e buscando dados.',
      );
    });

    it('joins three labels with comma + " e " on the last', () => {
      const out = buildProcessingTraceSummary([
        entry('Pensando'),
        entry('Buscando dados'),
        entry('Respondendo'),
      ]);
      expect(out).toBe('Pensando, buscando dados e respondendo.');
    });

    it('dedupes labels and normalizes whitespace + trailing dots', () => {
      const out = buildProcessingTraceSummary([
        entry('Pensando..'),
        entry('Pensando'),
        entry('  Pensando   '),
        entry('Buscando   dados.'),
      ]);
      expect(out).toBe('Pensando e buscando dados.');
    });
  });

  describe('buildThreadSummarySystemMessage', () => {
    it('returns null for blank/undefined summary', () => {
      expect(buildThreadSummarySystemMessage(undefined)).toBeNull();
      expect(buildThreadSummarySystemMessage('   ')).toBeNull();
    });

    it('wraps the summary in the conversation_memory system frame', () => {
      const out = buildThreadSummarySystemMessage('lead chamado João');
      expect(out).not.toBeNull();
      expect(out!.role).toBe('system');
      expect(typeof out!.content).toBe('string');
      const content = out!.content as string;
      expect(content).toContain('<conversation_memory>');
      expect(content).toContain('lead chamado João');
      expect(content).toContain('</conversation_memory>');
    });
  });

  describe('resolveClientRequestId', () => {
    it('returns undefined when metadata is missing or not a plain object', () => {
      expect(resolveClientRequestId(undefined)).toBeUndefined();
      expect(resolveClientRequestId([])).toBeUndefined();
      expect(resolveClientRequestId('string')).toBeUndefined();
    });

    it('returns undefined when clientRequestId is blank or non-string', () => {
      expect(resolveClientRequestId({ clientRequestId: '' })).toBeUndefined();
      expect(
        resolveClientRequestId({
          clientRequestId: '   ',
        }),
      ).toBeUndefined();
      expect(resolveClientRequestId({ clientRequestId: 42 })).toBeUndefined();
    });

    it('returns the trimmed clientRequestId when present', () => {
      expect(
        resolveClientRequestId({
          clientRequestId: '  req-7  ',
        }),
      ).toBe('req-7');
    });
  });
});
