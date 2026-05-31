import { buildChatModelMessagesPayload } from './kloel-reply-engine.build-messages.helpers';
import type { ReplyMessage } from './kloel-reply-engine.types';

describe('kloel-reply-engine.build-messages.helpers (K72 proof)', () => {
  const baseParams = {
    dynamicContext: 'ctx',
    marketingPromptAddendum: null,
    summaryMessage: null,
    recentMessages: [] as ReplyMessage[],
    cognitiveState: { mood: 'neutral' as const },
    currentInput: { raw: 'oi', channel: 'web', arrivalTimestamp: '2026-05-29T00:00:00Z' },
  };

  it('returns a payload starting with a runtimeContext user message and ending with a cognitiveState user message', () => {
    const msgs = buildChatModelMessagesPayload(baseParams);
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0]?.role).toBe('user');
    const firstContent = msgs[0]?.content;
    expect(typeof firstContent).toBe('string');
    expect(typeof firstContent === 'string' && firstContent.includes('runtimeContext')).toBe(true);
    const last = msgs[msgs.length - 1];
    expect(last?.role).toBe('user');
    const lastContent = last?.content;
    expect(typeof lastContent === 'string' && lastContent.includes('cognitiveState')).toBe(true);
  });

  it('inserts recentMessages in order between runtimeContext and cognitiveState', () => {
    const msgs = buildChatModelMessagesPayload({
      ...baseParams,
      recentMessages: [
        { role: 'user', content: 'pergunta antiga' },
        { role: 'assistant', content: 'resposta antiga' },
      ],
    });
    const contents = msgs.map((m) => (typeof m.content === 'string' ? m.content : ''));
    expect(contents.some((c) => c.includes('pergunta antiga'))).toBe(true);
    expect(contents.some((c) => c.includes('resposta antiga'))).toBe(true);
    const userIdx = contents.findIndex((c) => c.includes('pergunta antiga'));
    const assistantIdx = contents.findIndex((c) => c.includes('resposta antiga'));
    expect(userIdx).toBeLessThan(assistantIdx);
  });

  it('adds an assistant message at the end when assistantMessage is provided', () => {
    const msgs = buildChatModelMessagesPayload({
      ...baseParams,
      assistantMessage: { content: 'minha resposta', tool_calls: undefined },
    });
    const last = msgs[msgs.length - 1];
    expect(last?.role).toBe('assistant');
    expect(last?.content).toBe('minha resposta');
  });
});
