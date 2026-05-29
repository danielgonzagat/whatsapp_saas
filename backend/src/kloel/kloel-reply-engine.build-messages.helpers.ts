import OpenAI from 'openai';
import type { ReplyMessage } from './kloel-reply-engine.types';

type ChatCompletionMessageParam = OpenAI.Chat.ChatCompletionMessageParam;
/** Builds the message array from the pre-computed cognitiveState and context params. */
export function buildChatModelMessagesPayload(params: {
  dynamicContext: string;
  marketingPromptAddendum?: string | null;
  summaryMessage?: ChatCompletionMessageParam | null;
  recentMessages: ReplyMessage[];
  cognitiveState: Record<string, unknown>;
  currentInput: { raw: string; channel: string; arrivalTimestamp: string };
  assistantMessage?: {
    content?: string | null;
    tool_calls?: OpenAI.Chat.ChatCompletionAssistantMessageParam['tool_calls'];
  };
  toolMessages?: Array<{
    role?: 'tool';
    tool_call_id: string;
    name: string;
    content: string;
  }>;
}): ChatCompletionMessageParam[] {
  const msgs: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: JSON.stringify({
        runtimeContext: {
          dynamicContext: params.dynamicContext,
          marketingContext: params.marketingPromptAddendum ?? null,
        },
      }),
    },
  ];
  if (params.summaryMessage) {
    msgs.push({
      role: 'user',
      content: JSON.stringify({
        conversationSummary:
          typeof params.summaryMessage.content === 'string' ? params.summaryMessage.content : '',
      }),
    });
  }
  for (const entry of params.recentMessages) {
    msgs.push({ role: entry.role as 'user' | 'assistant', content: entry.content });
  }
  msgs.push({
    role: 'user',
    content: JSON.stringify({
      cognitiveState: params.cognitiveState,
      currentInput: params.currentInput,
    }),
  });
  if (params.assistantMessage) {
    const toolCalls = Array.isArray(params.assistantMessage.tool_calls)
      ? params.assistantMessage.tool_calls
      : undefined;
    msgs.push({
      role: 'assistant',
      content:
        typeof params.assistantMessage.content === 'string' ? params.assistantMessage.content : '',
      ...(toolCalls !== undefined ? { tool_calls: toolCalls } : {}),
    });
  }
  if (params.toolMessages?.length) {
    msgs.push(
      ...params.toolMessages.map((m) => ({
        role: 'tool' as const,
        tool_call_id: m.tool_call_id,
        content: m.content,
      })),
    );
  }
  return msgs;
}
