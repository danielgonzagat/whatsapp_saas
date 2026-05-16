// KloelService enforces token budget before the follow-up completion that consumes this output.
import { forEachSequential } from '../common/async-sequence';
import { buildTimestampedRuntimeId, buildTimestampedRuntimeKey } from './kloel-id.util';
import {
  type KloelStreamEvent,
  createKloelStatusEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
} from './kloel-stream-events';

type UnknownRecord = Record<string, unknown>;

const PATTERN_RE = /[_-]+/g;
const S_RE = /\s+/g;
const MAX_TOOL_MESSAGE_CONTENT_CHARS = 6000;
const ARTIFACT_PREFIX = 'tool_artifact';

type StoreToolArtifact = (workspaceId: string, key: string, content: string) => Promise<void>;
type ToolMessage = {
  role: 'tool';
  tool_call_id: string;
  name: string;
  content: string;
};

/** Kloel tool execution receipt shape. */
interface KloelToolExecutionReceipt {
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
  /** Artifact id property. */
  artifactId?: string;
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
  allowedTools?: string[];
  safeWrite?: (event: KloelStreamEvent) => void;
  executeLocalTool: (
    workspaceId: string,
    toolName: string,
    args: Record<string, unknown>,
    userId?: string,
  ) => Promise<unknown>;
}

interface ExecuteAssistantToolCallsResult {
  // budget is enforced upstream in KloelService before every LLM call.
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
    return value as UnknownRecord;
  }
  return { value };
}

function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw || '{}');
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function stringifyToolMessageContent(
  result: Record<string, unknown> | null,
  artifactId?: string,
): string {
  const content = JSON.stringify(result ?? null);
  if (content.length <= MAX_TOOL_MESSAGE_CONTENT_CHARS) {
    return content;
  }
  return JSON.stringify({
    success: result?.success === true,
    truncated: true,
    originalChars: content.length,
    preview: content.slice(0, MAX_TOOL_MESSAGE_CONTENT_CHARS),
    ...(artifactId !== undefined ? { artifactId } : {}),
    hint:
      artifactId !== undefined
        ? `Output completo armazenado como artefato durável. Use o artifactId para recuperar os dados completos via memória.`
        : undefined,
  });
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
    private readonly storeToolArtifact?: StoreToolArtifact,
  ) {}

  /** Execute assistant tool calls. */
  async executeAssistantToolCalls(
    input: ExecuteAssistantToolCallsInput,
  ): Promise<ExecuteAssistantToolCallsResult> {
    const receipts: KloelToolExecutionReceipt[] = [];
    const toolMessages: ToolMessage[] = [];
    const toolCalls = Array.isArray(input.assistantMessage?.tool_calls)
      ? input.assistantMessage.tool_calls
      : [];

    await forEachSequential(toolCalls, async (toolCall) => {
      const toolName = toolCall.function?.name || '';
      const callId = toolCall.id || buildTimestampedRuntimeId(toolName || 'tool');
      let toolArgs: Record<string, unknown> = {};

      try {
        toolArgs = parseToolArgs(toolCall.function?.arguments);
      } catch {
        this.logger.warn(`Failed to parse tool args for ${toolName}`);
      }

      input.safeWrite?.(
        createKloelStatusEvent('tool_calling', `Executando ${formatToolLabel(toolName)}.`),
      );
      input.safeWrite?.(createKloelToolCallEvent(callId, toolName, toolArgs));

      let result = toResultRecord(null);
      const isAllowed =
        input.allowedTools === undefined ? true : input.allowedTools.includes(toolName);

      if (!isAllowed) {
        result = {
          success: false,
          error: 'tool_not_allowed',
          toolName,
          allowedTools: input.allowedTools,
        };
      }

      if (isAllowed) {
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

      let artifactId: string | undefined;
      if (result) {
        const rawContent = JSON.stringify(result);
        if (rawContent.length > MAX_TOOL_MESSAGE_CONTENT_CHARS) {
          artifactId = buildTimestampedRuntimeKey(`${ARTIFACT_PREFIX}:${toolName}`);
          if (this.storeToolArtifact) {
            try {
              await this.storeToolArtifact(input.workspaceId, artifactId, rawContent);
            } catch (storeError: unknown) {
              this.logger.warn(
                `Falha ao armazenar artefato ${artifactId}: ${storeError instanceof Error ? storeError.message : 'unknown_error'}`,
              );
              artifactId = undefined;
            }
          }
        }
      }

      receipts.push({
        callId,
        name: toolName,
        args: toolArgs,
        success,
        result,
        ...(error !== undefined ? { error } : {}),
        ...(artifactId !== undefined ? { artifactId } : {}),
      });

      // already-budgeted completion; this router does not invoke OpenAI directly.
      toolMessages.push({
        role: 'tool',
        tool_call_id: callId,
        name: toolName,
        content: stringifyToolMessageContent(result, artifactId),
      });

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
          ...(error !== undefined ? { error } : {}),
          ...(artifactId !== undefined ? { artifactId } : {}),
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
