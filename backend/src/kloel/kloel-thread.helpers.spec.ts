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
  sanitizeAssistantThreadContentForRead,
  resolveClientRequestId,
  type StoredProcessingTraceEntry,
} from './kloel-thread.helpers';
import { type KloelStreamEvent } from './kloel-stream-events';
import * as threadHelpers from './kloel-thread.helpers';

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

  describe('sanitizeAssistantThreadContentForRead', () => {
    it('removes legacy mechanical operator success and auth failure text', () => {
      const content = sanitizeAssistantThreadContentForRead(
        'Acao "list_products" executada com sucesso. Falha ao executar "catálogo de produtos": Missing Authorization header. Tente novamente. Capacidade: self.health. Não exponha camada operacional, acesso à camada operacional, chamada a sistema ou estado oculto da ferramenta.',
      );

      expect(content).toContain('Consultei seu catálogo real');
      expect(content).toContain('sessão expirou');
      expect(content).toContain('Ação operacional: saúde operacional');
      expect(content).toContain('processo privado');
      expect(content).toContain('acesso ao processo privado');
      expect(content).toContain('detalhe privado');
      expect(content).toContain('estado privado');
      expect(content).not.toContain('à processo privado');
      expect(content).not.toContain('Acao');
      expect(content).not.toContain('list_products');
      expect(content).not.toContain('self.health');
      expect(content).not.toContain('camada operacional');
      expect(content).not.toContain('chamada a sistema');
      expect(content).not.toContain('estado oculto da ferramenta');
      expect(content).not.toContain('Missing Authorization header');
      expect(content).not.toContain('Falha ao executar');
    });

    it('preserves Markdown line breaks while normalizing public whitespace', () => {
      const content = sanitizeAssistantThreadContentForRead(
        '## Diagnóstico executivo\n\nTexto com   espaços.\n\n- Item\n\n\n\n## Próximo passo\n linha',
      );

      expect(content).toContain('## Diagnóstico executivo\n\nTexto com espaços.');
      expect(content).toContain('\n\n- Item\n\n## Próximo passo\nlinha');
      expect(content).not.toContain('\n\n\n');
    });
  });

  describe('extractExecutablePreResponseFromAssistantText', () => {
    const extractExecutablePreResponseFromAssistantText = () =>
      (
        threadHelpers as unknown as {
          extractExecutablePreResponseFromAssistantText: (value: string) => {
            visibleContent: string;
            processingTrace: StoredProcessingTraceEntry[];
            processingSummary?: string;
          };
        }
      ).extractExecutablePreResponseFromAssistantText;

    it('moves model-generated pre-response sections into persisted trace metadata', () => {
      const result = extractExecutablePreResponseFromAssistantText()(`Intro curto.
**Raciocínio resumido:** entendi o pedido e o contexto.
**Ações:**
- consultei o estado da conversa.
- escolhi a resposta mais clara.
**Observações:** não encontrei pendências críticas.
**Resposta final:** pronto, aqui está a resposta limpa.`);

      expect(result.visibleContent).toBe('pronto, aqui está a resposta limpa.');
      expect(result.processingTrace.map((entry) => [entry.phase, entry.label])).toEqual([
        ['thinking', 'Raciocínio resumido: entendi o pedido e o contexto.'],
        ['tool_calling', 'Ações: consultei o estado da conversa. escolhi a resposta mais clara.'],
        ['tool_result', 'Observações: não encontrei pendências críticas.'],
      ]);
      expect(result.processingSummary).toBe('Entendi o pedido e o contexto.');
    });

    it('keeps conceptual final-answer terms out of executable action headings', () => {
      const result = extractExecutablePreResponseFromAssistantText()(
        `**Raciocínio resumido** O pedido é conceitual e não exige ações no workspace. --- **Resposta final** - **Reasoning summary** resume o porquê. - **Agent trace** registra a execução. - **ReAct trajectory** organiza pensamento, ação e observação.`,
      );

      expect(result.visibleContent).toBe(
        '**Reasoning summary** resume o porquê. - **Agent trace** registra a execução. - **ReAct trajectory** organiza pensamento, ação e observação.',
      );
      expect(result.processingTrace.map((entry) => [entry.phase, entry.label])).toEqual([
        ['thinking', 'Raciocínio resumido: O pedido é conceitual e não exige ações no workspace.'],
      ]);
      expect(result.processingSummary).toBe(
        'O pedido é conceitual e não exige ações no workspace.',
      );
    });

    it.each([
      {
        reasoning: 'Chain-of-thought',
        action: 'Tool calling / function calling',
        observation: 'Tool observations',
        final: 'Final answer',
      },
      {
        reasoning: 'Reasoning trace / reasoning chain',
        action: 'ReAct trajectory',
        observation: 'Tool results',
        final: 'Final response',
      },
      {
        reasoning: 'Scratchpad',
        action: 'Computer use loop',
        observation: 'Observations',
        final: 'Answer',
      },
      {
        reasoning: 'Extended thinking / thinking blocks',
        action: 'Code Interpreter tool use',
        observation: 'Results',
        final: 'Response',
      },
      {
        reasoning: 'Reasoning item',
        action: 'Agent execution trace with ReAct-style intermediate steps',
        observation: 'Observation',
        final: 'Resposta final',
      },
    ])(
      'recognizes canonical pre-response headings %#',
      ({ reasoning, action, observation, final }) => {
        const result = extractExecutablePreResponseFromAssistantText()(`${reasoning}: resumo seguro.
${action}: executei a etapa.
${observation}: observei resultado.
${final}: final limpo.`);

        expect(result.visibleContent).toBe('final limpo.');
        expect(result.processingTrace.map((entry) => [entry.phase, entry.label])).toEqual([
          ['thinking', 'Raciocínio resumido: resumo seguro.'],
          ['tool_calling', 'Ações: executei a etapa.'],
          ['tool_result', 'Observações: observei resultado.'],
        ]);
        expect(result.processingSummary).toBe('Resumo seguro.');
      },
    );

    it('leaves ordinary assistant text untouched', () => {
      const result = extractExecutablePreResponseFromAssistantText()('Resposta normal sem trace.');

      expect(result.visibleContent).toBe('Resposta normal sem trace.');
      expect(result.processingTrace).toEqual([]);
      expect(result.processingSummary).toBeUndefined();
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

    it('uses product-grade labels for internal code tools', () => {
      expect(formatTraceToolLabel('code_outline')).toBe('inspeção da arquitetura interna');
      expect(formatTraceToolLabel('search_codebase')).toBe('busca na arquitetura interna');
      expect(formatTraceToolLabel('run_backend_tests')).toBe('validação operacional');
    });

    it('uses product-grade labels for workspace read tools', () => {
      expect(formatTraceToolLabel('list_products')).toBe('catálogo de produtos');
      expect(formatTraceToolLabel('create_site')).toBe('criação de site');
      expect(formatTraceToolLabel('refine_response')).toBe('mesa de refinamento');
      expect(formatTraceToolLabel('refine response')).toBe('mesa de refinamento');
      expect(formatTraceToolLabel('create image')).toBe('criação de imagem');
      expect(formatTraceToolLabel('get settings')).toBe('configurações da conta');
      expect(formatTraceToolLabel('get_billing_status')).toBe('status da assinatura');
      expect(formatTraceToolLabel('self.health')).toBe('saúde operacional');
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

    it('ignores tool status events because typed tool events are the source of truth', () => {
      const out = buildStoredProcessingTraceEntry({
        type: 'status',
        phase: 'tool_calling',
        message: 'Executando search web.',
      } as unknown as KloelStreamEvent);

      expect(out).toBeNull();
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

    it('builds a tool_call entry with formatted label and stable call-specific id', () => {
      const event = {
        type: 'tool_call',
        callId: 'call-1',
        tool: 'send_whatsapp_message',
      } as unknown as KloelStreamEvent;
      const out = buildStoredProcessingTraceEntry(event);
      expect(out).toEqual({
        id: 'call-1:call',
        kind: 'tool_call',
        phase: 'tool_calling',
        label: 'Consultei contexto operacional relevante antes de responder.',
        createdAt: matchInstance(String),
        tool: 'send whatsapp message',
        spanId: 'call-1',
      });
    });

    it('stores public trace tool names as safe product labels', () => {
      const call = buildStoredProcessingTraceEntry({
        type: 'tool_call',
        callId: 'health-check',
        tool: 'self.health',
      } as unknown as KloelStreamEvent);
      const result = buildStoredProcessingTraceEntry({
        type: 'tool_result',
        callId: 'health-check',
        tool: 'self.health',
        success: true,
      } as unknown as KloelStreamEvent);

      expect(call?.tool).toBe('saúde operacional');
      expect(result?.tool).toBe('saúde operacional');
      expect(JSON.stringify([call, result])).not.toContain('self.health');
    });

    it('does not reuse the same stored trace id for a tool call and its result', () => {
      const call = buildStoredProcessingTraceEntry({
        type: 'tool_call',
        callId: 'same-call',
        tool: 'lookup_lead',
      } as unknown as KloelStreamEvent);
      const result = buildStoredProcessingTraceEntry({
        type: 'tool_result',
        callId: 'same-call',
        tool: 'lookup_lead',
        success: true,
      } as unknown as KloelStreamEvent);

      expect(call?.id).toBe('same-call:call');
      expect(result?.id).toBe('same-call:result');
      expect(call?.id).not.toBe(result?.id);
    });

    it('builds a tool_result success and failure label', () => {
      const ok = buildStoredProcessingTraceEntry({
        type: 'tool_result',
        callId: 'c1',
        tool: 'lookup_lead',
        success: true,
      } as unknown as KloelStreamEvent);
      expect(ok?.label).toBe('Incorporei as observações encontradas antes de responder.');
      expect(ok?.success).toBe(true);
      expect(ok?.spanId).toBe('c1');

      const ko = buildStoredProcessingTraceEntry({
        type: 'tool_result',
        tool: 'lookup_lead',
        success: false,
        durationMs: 32,
      } as unknown as KloelStreamEvent);
      expect(ko?.label).toBe('Registrei uma limitação operacional antes de responder.');
      expect(ko?.success).toBe(false);
      expect(ko?.durationMs).toBe(32);
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

    it('summarizes tool trajectories without leaking raw event labels', () => {
      expect(
        buildProcessingTraceSummary([
          {
            id: 'call-1:call',
            kind: 'tool_call',
            phase: 'tool_calling',
            label: 'Consultei contexto operacional relevante antes de responder.',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'call-1:result',
            kind: 'tool_result',
            phase: 'tool_result',
            label: 'Incorporei as observações encontradas antes de responder.',
            createdAt: new Date().toISOString(),
            success: true,
          },
        ]),
      ).toBe(
        'Consultei contexto operacional relevante antes de responder e incorporei as observações encontradas antes de responder.',
      );
    });

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
