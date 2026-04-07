import OpenAI from 'openai';
import {
  createKloelStatusEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';

export interface KloelToolExecutionReceipt {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  success: boolean;
  result: any;
  error?: string;
}

interface ExecuteAssistantToolCallsInput {
  assistantMessage: {
    tool_calls?: Array<{
      id?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  workspaceId: string;
  userId?: string;
  safeWrite?: (event: KloelStreamEvent) => void;
  executeLocalTool: (
    workspaceId: string,
    toolName: string,
    args: Record<string, unknown>,
    userId?: string,
  ) => Promise<any>;
}

interface ExecuteAssistantToolCallsResult {
  toolMessages: OpenAI.Chat.ChatCompletionMessageParam[];
  receipts: KloelToolExecutionReceipt[];
  usedSearchWeb: boolean;
}

export class KloelToolRouter {
  constructor(
    private readonly logger: {
      warn(message: string): void;
    },
    private readonly unifiedAgentService: {
      executeTool(
        toolName: string,
        args: Record<string, unknown>,
        context: { workspaceId: string; phone: string; contactId: string },
      ): Promise<any>;
    },
  ) {}

  async executeAssistantToolCalls(
    input: ExecuteAssistantToolCallsInput,
  ): Promise<ExecuteAssistantToolCallsResult> {
    const receipts: KloelToolExecutionReceipt[] = [];
    const toolMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const toolCalls = Array.isArray(input.assistantMessage?.tool_calls)
      ? input.assistantMessage.tool_calls
      : [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name || '';
      const callId =
        toolCall.id || `${toolName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let toolArgs: Record<string, unknown> = {};

      try {
        toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
      } catch {
        this.logger.warn(`Failed to parse tool args for ${toolName}`);
      }

      input.safeWrite?.(createKloelStatusEvent('tool_calling'));
      input.safeWrite?.(createKloelToolCallEvent(callId, toolName, toolArgs));

      let result: any = null;

      try {
        result = await this.unifiedAgentService.executeTool(toolName, toolArgs, {
          workspaceId: input.workspaceId,
          phone: String(toolArgs?.phone || ''),
          contactId: String(toolArgs?.contactId || ''),
        });
      } catch (error: any) {
        this.logger.warn(`UnifiedAgent tool ${toolName} falhou: ${error?.message}`);
      }

      if (!result || result?.error === 'Unknown tool') {
        result = await input.executeLocalTool(input.workspaceId, toolName, toolArgs, input.userId);
      }

      const success =
        !!result &&
        (result.success === true || result.ok === true || result.status === 'success') &&
        !result.error;
      const error = !success ? result?.error || result?.message || 'tool_failed' : undefined;

      receipts.push({
        callId,
        name: toolName,
        args: toolArgs,
        success,
        result,
        error,
      });

      toolMessages.push({
        role: 'tool',
        tool_call_id: callId,
        name: toolName,
        content: JSON.stringify(result ?? null),
      } as OpenAI.Chat.ChatCompletionMessageParam);

      input.safeWrite?.(createKloelStatusEvent('tool_result'));
      input.safeWrite?.(
        createKloelToolResultEvent({
          callId,
          tool: toolName,
          success,
          result,
          error,
        }),
      );
    }

    return {
      toolMessages,
      receipts,
      usedSearchWeb: receipts.some((receipt) => receipt.name === 'search_web'),
    };
  }
}
