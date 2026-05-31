import { describe, it, expect } from 'vitest';
import {
  AGENT_MODE_DISABLES,
  AGENT_MODE_ENABLES,
  EMPTY_AUTOPILOT_DECISION,
  NEGOTIATION_KEYWORDS,
  PRODUCT_KEYWORDS,
  SENDING_TOOLS,
  TOOL_TO_ACTION,
  TOOL_TO_INTENT,
  extractAutopilotSettings,
  extractTextResponse,
  hasEnoughQuestions,
  hasUnifiedAgentContentSignals,
  mapUnifiedActionsToAutopilot,
  matchesAnyKeyword,
  resolveAgentModeOverride,
  resolveUnifiedAgentSettingOverride,
  shouldUseUnifiedAgent,
  type UnifiedAgentResult,
} from '../providers/unified-agent-integrator.helpers';

describe('unified-agent-integrator.helpers — keyword corpora', () => {
  it('includes the canonical Portuguese negotiation triggers', () => {
    expect(NEGOTIATION_KEYWORDS).toContain('desconto');
    expect(NEGOTIATION_KEYWORDS).toContain('parcelar');
    expect(NEGOTIATION_KEYWORDS).toContain('à vista');
  });

  it('includes the canonical product-question triggers', () => {
    expect(PRODUCT_KEYWORDS).toContain('como funciona');
    expect(PRODUCT_KEYWORDS).toContain('garantia');
  });

  it('marks the right sending tools (only message-emitting actions)', () => {
    expect(SENDING_TOOLS.has('send_message')).toBe(true);
    expect(SENDING_TOOLS.has('send_product_info')).toBe(true);
    expect(SENDING_TOOLS.has('update_lead_status')).toBe(false);
    expect(SENDING_TOOLS.has('add_tag')).toBe(false);
  });
});

describe('unified-agent-integrator.helpers — autopilot setting parsers', () => {
  it('returns null when settings is missing or autopilot is not an object', () => {
    expect(extractAutopilotSettings(null)).toBeNull();
    expect(extractAutopilotSettings({})).toBeNull();
    expect(extractAutopilotSettings({ autopilot: 'not-an-object' })).toBeNull();
  });

  it('returns the autopilot block when present', () => {
    const block = { useUnifiedAgent: true };
    expect(extractAutopilotSettings({ autopilot: block })).toBe(block);
  });

  it('disables unified agent for fallback_only / local_only modes', () => {
    for (const mode of AGENT_MODE_DISABLES) {
      expect(resolveAgentModeOverride({ agentMode: mode })).toBe(false);
    }
  });

  it('enables unified agent for primary / unified_primary modes', () => {
    for (const mode of AGENT_MODE_ENABLES) {
      expect(resolveAgentModeOverride({ agentMode: mode })).toBe(true);
    }
  });

  it('returns null when the agentMode is unrecognized', () => {
    expect(resolveAgentModeOverride({ agentMode: 'anything-else' })).toBeNull();
    expect(resolveAgentModeOverride(null)).toBeNull();
  });

  it('honors explicit useUnifiedAgent boolean before agentMode', () => {
    expect(
      resolveUnifiedAgentSettingOverride({ useUnifiedAgent: true, agentMode: 'fallback_only' }),
    ).toBe(true);
    expect(
      resolveUnifiedAgentSettingOverride({ useUnifiedAgent: false, agentMode: 'primary' }),
    ).toBe(false);
  });

  it('falls back to agentMode when useUnifiedAgent is absent', () => {
    expect(resolveUnifiedAgentSettingOverride({ agentMode: 'primary' })).toBe(true);
    expect(resolveUnifiedAgentSettingOverride({ agentMode: 'fallback_only' })).toBe(false);
    expect(resolveUnifiedAgentSettingOverride({})).toBeNull();
  });
});

describe('unified-agent-integrator.helpers — content signals', () => {
  it('counts question marks correctly', () => {
    expect(hasEnoughQuestions('só uma?')).toBe(false);
    expect(hasEnoughQuestions('um? dois?')).toBe(true);
    expect(hasEnoughQuestions('a? b? c?')).toBe(true);
    expect(hasEnoughQuestions('nenhuma pergunta')).toBe(false);
  });

  it('matches keywords case-sensitively (caller lowercases first)', () => {
    expect(matchesAnyKeyword('quero um desconto agora', NEGOTIATION_KEYWORDS)).toBe(true);
    expect(matchesAnyKeyword('texto neutro', NEGOTIATION_KEYWORDS)).toBe(false);
  });

  it('flags long messages as Unified-Agent-worthy', () => {
    const longMessage = 'a'.repeat(201);
    expect(hasUnifiedAgentContentSignals(longMessage)).toBe(true);
  });

  it('flags multi-question messages', () => {
    expect(hasUnifiedAgentContentSignals('como funciona? quanto custa?')).toBe(true);
  });

  it('flags negotiation and product keyword messages', () => {
    expect(hasUnifiedAgentContentSignals('isso é caro demais para mim')).toBe(true);
    expect(hasUnifiedAgentContentSignals('como funciona o produto')).toBe(true);
  });

  it('returns false for short neutral messages', () => {
    expect(hasUnifiedAgentContentSignals('oi tudo bem')).toBe(false);
  });
});

describe('unified-agent-integrator.helpers — shouldUseUnifiedAgent', () => {
  it('respects setting overrides above all other heuristics', () => {
    expect(
      shouldUseUnifiedAgent({
        messageContent: 'desconto',
        leadScore: 95,
        settings: { autopilot: { useUnifiedAgent: false } },
      }),
    ).toBe(false);
  });

  it('routes hot leads (score ≥ 70) through the unified agent', () => {
    expect(
      shouldUseUnifiedAgent({
        messageContent: 'oi',
        leadScore: 80,
      }),
    ).toBe(true);
  });

  it('routes content-signaled messages through the unified agent', () => {
    expect(
      shouldUseUnifiedAgent({
        messageContent: 'consigo menos no preço?',
      }),
    ).toBe(true);
  });

  it('keeps neutral cool-lead messages on the cheap local autopilot path', () => {
    expect(
      shouldUseUnifiedAgent({
        messageContent: 'oi',
      }),
    ).toBe(false);
  });
});

describe('unified-agent-integrator.helpers — mapUnifiedActionsToAutopilot', () => {
  it('returns the EMPTY decision when actions is empty', () => {
    const decision = mapUnifiedActionsToAutopilot([]);
    expect(decision).toEqual(EMPTY_AUTOPILOT_DECISION);
    expect(decision).not.toBe(EMPTY_AUTOPILOT_DECISION); // returned a copy
  });

  it('maps send_product_info to the BUYING/SEND_OFFER pair', () => {
    const decision = mapUnifiedActionsToAutopilot([
      { tool: 'send_product_info', args: { name: 'X' } },
    ]);
    expect(decision.intent).toBe(TOOL_TO_INTENT.send_product_info);
    expect(decision.action).toBe(TOOL_TO_ACTION.send_product_info);
    expect(decision.alreadyExecuted).toBe(true);
    expect(decision.reason).toBe('unified_agent:send_product_info');
    expect(decision.confidence).toBeCloseTo(0.9);
  });

  it('does not mark non-sending tools as already executed', () => {
    const decision = mapUnifiedActionsToAutopilot([
      { tool: 'update_lead_status', args: { status: 'qualified' } },
    ]);
    expect(decision.alreadyExecuted).toBe(false);
  });

  it('falls back to FOLLOW_UP for unknown tool names', () => {
    const decision = mapUnifiedActionsToAutopilot([{ tool: 'totally_made_up_tool', args: {} }]);
    expect(decision.intent).toBe('FOLLOW_UP');
    expect(decision.action).toBe('FOLLOW_UP');
  });
});

describe('unified-agent-integrator.helpers — extractTextResponse', () => {
  it('prefers the top-level response field', () => {
    const result: UnifiedAgentResult = {
      response: 'direct text',
      actions: [{ tool: 'send_message', args: { message: 'other' } }],
    };
    expect(extractTextResponse(result)).toBe('direct text');
  });

  it('falls back to the send_message action arg', () => {
    const result: UnifiedAgentResult = {
      actions: [{ tool: 'send_message', args: { message: 'from action' } }],
    };
    expect(extractTextResponse(result)).toBe('from action');
  });

  it('returns empty string when no text is available', () => {
    const result: UnifiedAgentResult = {
      actions: [{ tool: 'add_tag', args: { tag: 'x' } }],
    };
    expect(extractTextResponse(result)).toBe('');
  });

  it('ignores non-string message args from the send_message tool', () => {
    const result: UnifiedAgentResult = {
      actions: [{ tool: 'send_message', args: { message: 42 } }],
    };
    expect(extractTextResponse(result)).toBe('');
  });
});
