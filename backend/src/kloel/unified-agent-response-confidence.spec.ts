import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { CANONICAL_MODEL_IDS } from '../lib/openai-models';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import type { ActionEntry } from './unified-agent.types';

describe('UnifiedAgentResponseService calculateConfidence', () => {
  const service = new UnifiedAgentResponseService({
    ensureTokenBudget: jest.fn(),
    trackAiUsage: jest.fn(),
  } as unknown as PlanLimitsService);

  it('calculates confidence based on actions and tool calls', () => {
    const response: OpenAI.Chat.Completions.ChatCompletion = {
      id: 'cmpl-test-1',
      created: Math.floor(Date.now() / 1000),
      model: CANONICAL_MODEL_IDS.openAiLegacyGpt4,
      object: 'chat.completion',
      choices: [
        {
          finish_reason: 'tool_calls',
          index: 0,
          logprobs: null,
          message: {
            content: null,
            refusal: null,
            role: 'assistant',
            tool_calls: [
              {
                id: 't1',
                type: 'function' as const,
                function: { name: 'test', arguments: '{}' },
              },
            ],
          },
        },
      ],
    };

    const confidence = service.calculateConfidence(
      [{ tool: 'send_message', args: {}, result: 'ok' }],
      response,
    );

    expect(confidence).toBeGreaterThan(0.5);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('caps confidence at 1', () => {
    const toolCalls: Array<OpenAI.Chat.Completions.ChatCompletionMessageToolCall> = Array.from(
      { length: 10 },
      (_, i) => ({
        id: `tc-${i + 1}`,
        type: 'function' as const,
        function: { name: `tool${i + 1}`, arguments: '{}' },
      }),
    );
    const response: OpenAI.Chat.Completions.ChatCompletion = {
      id: 'cmpl-test-2',
      created: Math.floor(Date.now() / 1000),
      model: CANONICAL_MODEL_IDS.openAiLegacyGpt4,
      object: 'chat.completion',
      choices: [
        {
          finish_reason: 'tool_calls',
          index: 0,
          logprobs: null,
          message: {
            content: null,
            refusal: null,
            role: 'assistant',
            tool_calls: toolCalls,
          },
        },
      ],
    };

    const confidence = service.calculateConfidence(
      Array.from<ActionEntry>({ length: 20 }, () => ({ tool: 't', args: {}, result: 'ok' })),
      response,
    );

    expect(confidence).toBeCloseTo(0.95);
  });
});
