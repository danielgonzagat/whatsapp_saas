// PULSE:OK — tool router only serializes tool-call messages. It does not perform LLM calls;
// KloelService enforces token budget before the follow-up completion that consumes this output.
import { forEachSequential } from '../common/async-sequence';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import {
  type KloelStreamEvent,
  createKloelStatusEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
} from './kloel-stream-events';

const PATTERN_RE = /[_-]+/g;
const S_RE = /\s+/g;
type ToolMessage = {
  role: 'tool';
  tool_call_id: string;
  name: string;
  content: string;
};

/** Kloel tool execution receipt shape. */
export interface KloelToolExecutionReceipt {
  /** Call id property. */
  callId: string;
  /** Name property. */
  name: string;
  /** Args property. */
  args: Record<string, unknown>;
  /** Success property. */
  success: boolean;
  /** Result property. */
  result: Record<string, unknown> | null;
  /** Error property. */
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
  ) => Promise<unknown>;
}

interface ExecuteAssistantToolCallsResult {
  // PULSE:OK — toolMessages are plain transcript objects for the next completion;
  // budget is enforced upstream in KloelService before any LLM call.
  toolMessages: ToolMessage[];
  receipts: KloelToolExecutionReceipt[];
  usedSearchWeb: boolean;
}

function formatToolLabel(toolName: string) {
  const normalized = String(toolName || 'ferramenta')
    .trim()
    .replace(PATTERN_RE, ' ')
    .replace(S_RE, ' ')
    .toLowerCase();

  return normalized || 'ferramenta';
}

function stringArgument(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function toResultRecord(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

/** Kloel tool router. */
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
      ): Promise<unknown>;
    },
  ) {}

  /** Execute assistant tool calls. */
  async executeAssistantToolCalls(
    input: ExecuteAssistantToolCallsInput,
  ): Promise<ExecuteAssistantToolCallsResult> {
    const receipts: KloelToolExecutionReceipt[] = [];
    // PULSE:OK — local accumulation only; no model call happens in this router.
    const toolMessages: ToolMessage[] = [];
    const toolCalls = Array.isArray(input.assistantMessage?.tool_calls)
      ? input.assistantMessage.tool_calls
      : [];

    await forEachSequential(toolCalls, async (toolCall) => {
      const toolName = toolCall.function?.name || '';
      const callId = toolCall.id || buildTimestampedRuntimeId(toolName || 'tool');
      let toolArgs: Record<string, unknown> = {};

      try {
        toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
      } catch {
        this.logger.warn(`Failed to parse tool args for ${toolName}`);
      }

      input.safeWrite?.(
        createKloelStatusEvent('tool_calling', `Executando ${formatToolLabel(toolName)}.`),
      );
      input.safeWrite?.(createKloelToolCallEvent(callId, toolName, toolArgs));

      let result = toResultRecord(null);

      try {
        result = toResultRecord(
          await this.unifiedAgentService.executeTool(toolName, toolArgs, {
            workspaceId: input.workspaceId,
            phone: stringArgument(toolArgs.phone),
            contactId: stringArgument(toolArgs.contactId),
          }),
        );
      } catch (error: unknown) {
        this.logger.warn(
          `UnifiedAgent tool ${toolName} falhou: ${error instanceof Error ? error.message : 'unknown_error'}`,
        );
      }

      if (!result || result?.error === 'Unknown tool') {
        result = toResultRecord(
          await input.executeLocalTool(input.workspaceId, toolName, toolArgs, input.userId),
        );
      }

      const success =
        !!result &&
        (result.success === true || result.ok === true || result.status === 'success') &&
        !result.error;
      const error = !success
        ? typeof result?.error === 'string'
          ? result.error
          : typeof result?.message === 'string'
            ? result.message
            : 'tool_failed'
        : undefined;

      receipts.push({
        callId,
        name: toolName,
        args: toolArgs,
        success,
        result,
        error,
      });

      // PULSE:OK — cast only serializes a tool result message for the caller's next
      // already-budgeted completion; this router does not invoke OpenAI directly.
      toolMessages.push({
        role: 'tool',
        tool_call_id: callId,
        name: toolName,
        content: JSON.stringify(result ?? null),
      } as ToolMessage);

      input.safeWrite?.(
        createKloelStatusEvent(
          'tool_result',
          success
            ? `Concluiu ${formatToolLabel(toolName)}.`
            : `Falhou ao executar ${formatToolLabel(toolName)}.`,
        ),
      );
      input.safeWrite?.(
        createKloelToolResultEvent({
          callId,
          tool: toolName,
          success,
          result,
          error,
        }),
      );
    });

    return {
      toolMessages,
      receipts,
      usedSearchWeb: receipts.some((receipt) => receipt.name === 'search_web'),
    };
  }
}
