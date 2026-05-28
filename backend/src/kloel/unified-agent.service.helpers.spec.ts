import type { ActionEntry } from './unified-agent.types';
import {
  COGNITIVE_STATE_CONTEXT_INSTRUCTION,
  COGNITIVE_STATE_PREAMBLE,
  CONFIDENCE_WITHOUT_ACTIONS,
  CONFIDENCE_WITH_ACTIONS,
  DEFAULT_TACTICAL_HINT,
  PRODUCT_AI_CONFIG_BATCH_SIZE,
  PRODUCT_AI_CONFIG_SELECT,
  SEED_SYSTEM_MESSAGE_CONTENT,
  buildAgentUserPayload,
  buildBlockedActionEntry,
  buildBlockedToolResult,
  buildContactSummary,
  buildCurrentInput,
  buildLayeredSystemPrompt,
  confidenceForPredecidedActions,
  extractProductIds,
  mapActionsForTurnOutcome,
  parseToolArguments,
} from './unified-agent.service.helpers';

describe('unified-agent.service.helpers', () => {
  describe('static prompt constants', () => {
    it('keeps the seed system message frozen — guard against silent prompt drift', () => {
      expect(SEED_SYSTEM_MESSAGE_CONTENT.startsWith('Voce e o assistente comercial Kloel')).toBe(
        true,
      );
      // Must instruct the agent to use tools and avoid invention.
      expect(SEED_SYSTEM_MESSAGE_CONTENT).toContain('tools');
      expect(SEED_SYSTEM_MESSAGE_CONTENT).toContain('Nao invente capacidades');
    });

    it('emits the cognitive-state preamble with all baseline-empty fields', () => {
      expect(COGNITIVE_STATE_PREAMBLE).toContain('capabilities.available=[]');
      expect(COGNITIVE_STATE_PREAMBLE).toContain('memory.workingMemory=[]');
      expect(COGNITIVE_STATE_PREAMBLE).toContain('beliefs=[]');
      expect(COGNITIVE_STATE_PREAMBLE).toContain('predictions.active=[]');
      expect(COGNITIVE_STATE_PREAMBLE).toContain('pulseTruth.verdict=INSUFFICIENT_EVIDENCE');
    });

    it('declares cognitiveState as the source of truth in the context instruction', () => {
      expect(COGNITIVE_STATE_CONTEXT_INSTRUCTION).toContain('source of truth');
      expect(COGNITIVE_STATE_CONTEXT_INSTRUCTION).toContain(
        'cognitiveState.capabilities.available',
      );
    });

    it('keeps the default tactical hint as a non-empty Portuguese sentence', () => {
      expect(DEFAULT_TACTICAL_HINT.length).toBeGreaterThan(0);
      expect(DEFAULT_TACTICAL_HINT).toContain('próximo passo');
    });
  });

  describe('confidenceForPredecidedActions', () => {
    it('returns the with-actions constant when at least one action ran', () => {
      expect(confidenceForPredecidedActions({ length: 1 })).toBe(CONFIDENCE_WITH_ACTIONS);
      expect(confidenceForPredecidedActions({ length: 17 })).toBe(CONFIDENCE_WITH_ACTIONS);
    });

    it('returns the without-actions constant when no actions ran', () => {
      expect(confidenceForPredecidedActions({ length: 0 })).toBe(CONFIDENCE_WITHOUT_ACTIONS);
    });

    it('keeps with > without so downstream sorting/thresholds stay correct', () => {
      expect(CONFIDENCE_WITH_ACTIONS).toBeGreaterThan(CONFIDENCE_WITHOUT_ACTIONS);
    });
  });

  describe('buildContactSummary', () => {
    it('uses the trimmed contact name when present', () => {
      const summary = buildContactSummary({
        rawName: '  Daniel  ',
        rawSentiment: '',
        rawLeadScore: '7',
        tags: 'vip, lead',
        fallbackIdentifier: '+55123',
      });
      expect(summary.name).toBe('Daniel');
      expect(summary.leadScore).toBe('7');
      expect(summary.tags).toBe('vip, lead');
    });

    it('falls back to the fallback identifier (phone) when name is empty', () => {
      const summary = buildContactSummary({
        rawName: '   ',
        rawSentiment: '',
        rawLeadScore: '',
        tags: 'nenhuma',
        fallbackIdentifier: '+5511999999999',
      });
      expect(summary.name).toBe('+5511999999999');
    });

    it('defaults sentiment to NEUTRAL when raw sentiment is blank or whitespace', () => {
      expect(
        buildContactSummary({
          rawName: 'x',
          rawSentiment: '   ',
          rawLeadScore: '0',
          tags: 'nenhuma',
          fallbackIdentifier: 'fb',
        }).sentiment,
      ).toBe('NEUTRAL');
    });

    it('defaults leadScore to "0" when raw lead score is empty', () => {
      expect(
        buildContactSummary({
          rawName: 'x',
          rawSentiment: 'POSITIVE',
          rawLeadScore: '',
          tags: 'nenhuma',
          fallbackIdentifier: 'fb',
        }).leadScore,
      ).toBe('0');
    });
  });

  describe('buildCurrentInput', () => {
    it('builds a current-input envelope with ISO timestamp', () => {
      const fixed = new Date('2024-01-02T03:04:05.678Z');
      const input = buildCurrentInput({
        message: 'hello',
        channel: 'whatsapp',
        now: () => fixed,
      });
      expect(input).toEqual({
        raw: 'hello',
        channel: 'whatsapp',
        arrivalTimestamp: '2024-01-02T03:04:05.678Z',
      });
    });

    it('uses the real Date when no `now` injector is provided', () => {
      const before = Date.now();
      const input = buildCurrentInput({ message: 'm', channel: 'c' });
      const after = Date.now();
      const ts = Date.parse(input.arrivalTimestamp);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after + 5);
    });
  });

  describe('buildLayeredSystemPrompt', () => {
    it('concatenates preamble + workspace block + agent-runtime block separated by blank lines', () => {
      const out = buildLayeredSystemPrompt({
        workspaceProductBlock: 'WORKSPACE',
        agentRuntimeBlock: 'RUNTIME',
      });
      expect(out).toBe(`${COGNITIVE_STATE_PREAMBLE}\n\nWORKSPACE\n\nRUNTIME`);
    });

    it('keeps empty agent-runtime block from collapsing structural separators', () => {
      const out = buildLayeredSystemPrompt({
        workspaceProductBlock: 'WORKSPACE',
        agentRuntimeBlock: '',
      });
      expect(out).toBe(`${COGNITIVE_STATE_PREAMBLE}\n\nWORKSPACE\n\n`);
    });
  });

  describe('buildAgentUserPayload', () => {
    const contact = {
      name: 'Daniel',
      sentiment: 'POSITIVE',
      leadScore: '9',
      tags: 'vip',
    };
    const currentInput = {
      raw: 'oi',
      channel: 'whatsapp',
      arrivalTimestamp: '2024-01-01T00:00:00.000Z',
    };

    it('emits the canonical payload shape consumed by the LLM', () => {
      const payload = buildAgentUserPayload({
        cognitiveState: { audience: 'public' },
        systemPrompt: 'SYS',
        compressedContext: 'compressed',
        additionalContext: 'add',
        tacticalHint: 'be brief',
        stylePolicy: 'style',
        contact,
        currentInput,
      });
      expect(payload).toEqual({
        contextInstruction: COGNITIVE_STATE_CONTEXT_INSTRUCTION,
        cognitiveState: { audience: 'public' },
        runtimeContext: {
          workspaceProductContext: 'SYS',
          compressedMemory: 'compressed',
          additionalContext: 'add',
          tacticalHint: 'be brief',
          responsePolicy: 'style',
        },
        contact: { ...contact },
        currentInput: { ...currentInput },
      });
    });

    it('falls compressedMemory back to null when no compressed context exists', () => {
      const payload = buildAgentUserPayload({
        cognitiveState: {},
        systemPrompt: '',
        compressedContext: null,
        additionalContext: '',
        tacticalHint: 'x',
        stylePolicy: '',
        contact,
        currentInput,
      });
      expect((payload.runtimeContext as Record<string, unknown>).compressedMemory).toBeNull();
    });

    it('falls compressedMemory back to null when context is an empty string', () => {
      const payload = buildAgentUserPayload({
        cognitiveState: {},
        systemPrompt: '',
        compressedContext: '',
        additionalContext: '',
        tacticalHint: 'x',
        stylePolicy: '',
        contact,
        currentInput,
      });
      expect((payload.runtimeContext as Record<string, unknown>).compressedMemory).toBeNull();
    });

    it('uses the default tactical hint when caller passes empty string', () => {
      const payload = buildAgentUserPayload({
        cognitiveState: {},
        systemPrompt: '',
        compressedContext: null,
        additionalContext: '',
        tacticalHint: '',
        stylePolicy: '',
        contact,
        currentInput,
      });
      expect((payload.runtimeContext as Record<string, unknown>).tacticalHint).toBe(
        DEFAULT_TACTICAL_HINT,
      );
    });

    it('serializes deterministically when stringified — same input ⇒ same string', () => {
      const args = {
        cognitiveState: { audience: 'public' },
        systemPrompt: 'sp',
        compressedContext: null,
        additionalContext: 'ac',
        tacticalHint: 'th',
        stylePolicy: 'sp2',
        contact,
        currentInput,
      } as const;
      expect(JSON.stringify(buildAgentUserPayload(args))).toBe(
        JSON.stringify(buildAgentUserPayload(args)),
      );
    });
  });

  describe('parseToolArguments', () => {
    it('returns {} for null/undefined/empty string', () => {
      expect(parseToolArguments(null)).toEqual({});
      expect(parseToolArguments(undefined)).toEqual({});
      expect(parseToolArguments('')).toEqual({});
    });

    it('parses a valid JSON object', () => {
      expect(parseToolArguments('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
    });

    it('returns {} when the JSON parses to an array (not a record)', () => {
      // Tools always receive a record-shaped arg bag; arrays are nonsensical here.
      expect(parseToolArguments('[1,2,3]')).toEqual({});
    });

    it('returns {} when the JSON parses to null', () => {
      expect(parseToolArguments('null')).toEqual({});
    });

    it('returns {} and invokes the error callback on malformed JSON', () => {
      const onErr = jest.fn();
      expect(parseToolArguments('{not json', onErr)).toEqual({});
      expect(onErr).toHaveBeenCalledTimes(1);
      expect(onErr.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    it('does not throw when no error callback is supplied', () => {
      expect(() => parseToolArguments('{bad')).not.toThrow();
    });
  });

  describe('mapActionsForTurnOutcome', () => {
    it('maps each action to {toolName, success, result}', () => {
      const actions: ActionEntry[] = [
        { tool: 'send_message', args: {}, result: { success: true } },
        { tool: 'create_lead', args: {}, result: { ok: false } },
        { tool: 'schedule', args: {}, result: undefined },
      ];
      expect(mapActionsForTurnOutcome(actions)).toEqual([
        { toolName: 'send_message', success: true, result: { success: true } },
        { toolName: 'create_lead', success: false, result: { ok: false } },
        { toolName: 'schedule', success: false, result: undefined },
      ]);
    });

    it('treats `executed: true` as success', () => {
      const out = mapActionsForTurnOutcome([
        { tool: 't', args: {}, result: { executed: true } },
      ]);
      expect(out[0]?.success).toBe(true);
    });

    it('handles empty action lists', () => {
      expect(mapActionsForTurnOutcome([])).toEqual([]);
    });
  });

  describe('buildBlockedToolResult / buildBlockedActionEntry', () => {
    it('returns the canonical blocked tool result', () => {
      expect(buildBlockedToolResult()).toEqual({
        blocked: true,
        reason: 'capability_not_allowed',
      });
    });

    it('emits a fresh result object per call so the audit log entry is not shared', () => {
      // Both call sites push the result into independent stores (action list and
      // logAutopilotEvent) — keeping the references distinct prevents one
      // mutation from leaking across.
      const a = buildBlockedToolResult();
      const b = buildBlockedToolResult();
      expect(a).not.toBe(b);
    });

    it('builds a blocked action entry preserving the tool name with empty args', () => {
      const entry = buildBlockedActionEntry('forbidden_tool');
      expect(entry.tool).toBe('forbidden_tool');
      expect(entry.args).toEqual({});
      expect(entry.result).toEqual({ blocked: true, reason: 'capability_not_allowed' });
    });
  });

  describe('extractProductIds', () => {
    const readers = {
      readRecord: (value: unknown) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>) : {},
      readOptionalText: (value: unknown) =>
        typeof value === 'string' && value.length > 0 ? value : undefined,
    };

    it('prefers the inner `value.id` over the outer `product.id`', () => {
      const ids = extractProductIds(
        [{ id: 'outer', value: { id: 'inner' } }, { id: 'only-outer', value: {} }],
        readers,
      );
      expect(ids).toEqual(['inner', 'only-outer']);
    });

    it('drops entries with no resolvable id', () => {
      const ids = extractProductIds(
        [
          { id: undefined, value: undefined },
          { value: { id: '' } },
          { id: 'kept', value: {} },
        ],
        readers,
      );
      expect(ids).toEqual(['kept']);
    });

    it('returns an empty list for an empty input', () => {
      expect(extractProductIds([], readers)).toEqual([]);
    });
  });

  describe('PRODUCT_AI_CONFIG_SELECT / PRODUCT_AI_CONFIG_BATCH_SIZE', () => {
    it('lists exactly the prompt-driving columns Prisma should project', () => {
      expect(PRODUCT_AI_CONFIG_SELECT).toEqual({
        id: true,
        productId: true,
        tone: true,
        persistenceLevel: true,
        messageLimit: true,
        customerProfile: true,
        positioning: true,
        objections: true,
        salesArguments: true,
      });
    });

    it('caps batch size at the historical 50-row ceiling to bound prompt length', () => {
      expect(PRODUCT_AI_CONFIG_BATCH_SIZE).toBe(50);
    });
  });
});
