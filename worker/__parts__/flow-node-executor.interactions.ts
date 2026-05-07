import {
  nestedString,
  readBoolean,
  readNumber,
  readOptionalString,
  readString,
  varAsString,
} from '../flow-engine.helpers';
import type { ExecutionState, FlowNode } from '../flow-engine.types';
import { prisma } from '../db';
import { redis } from '../redis-client';
import { pollUntil } from '../utils/async-sequence';
import type { FlowNodeExecutorDeps, FlowNodeResult } from './flow-node-executor.types';

export async function executeAutoPitchNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const systemPrompt = readString(node.data, 'systemPrompt');
  const outputVariable = readString(node.data, 'outputVariable', 'auto_pitch');
  const includeSummary = readBoolean(node.data, 'includeSummary');
  const lastMsg = varAsString(state.variables.last_user_message);

  let finalPitch = '';
  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: state.workspaceId } });
    const apiKey =
      nestedString(workspace?.providerSettings, 'openai', 'apiKey') || process.env.OPENAI_API_KEY;

    if (apiKey) {
      const { AIProvider } = await import('../providers/ai-provider');
      const ai = new AIProvider(apiKey);

      const sys =
        systemPrompt ||
        'Você é um closer agressivo e conciso. Gere uma oferta direta com CTA claro. Use linguagem natural e curta.';
      const user = `Mensagem do lead: "${lastMsg || 'sem contexto'}". Gere uma oferta curta com CTA e, se fizer sentido, um pequeno resumo do valor.`;
      finalPitch = await ai.generateResponse(sys, user);
    }
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    deps.log.warn('auto_pitch_ai_fallback', { error: errInstanceofError?.message });
  }

  if (!finalPitch) {
    const summary = includeSummary ? 'Resumo: você ganha agilidade e mais respostas rápidas. ' : '';
    finalPitch = `${summary}Tenho uma oferta especial para você hoje. Podemos fechar agora? Se sim, responda "sim" que eu já envio os próximos passos.`;
  }

  state.variables[outputVariable] = finalPitch;
  return node.next ?? 'END';
}

export async function executeMediaNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const url = readString(node.data, 'url');
  const mediaTypeRaw = readString(node.data, 'mediaType');
  const caption = readOptionalString(node.data, 'caption');
  const mediaType: 'image' | 'video' | 'audio' | 'document' | null =
    mediaTypeRaw === 'image' ||
    mediaTypeRaw === 'video' ||
    mediaTypeRaw === 'audio' ||
    mediaTypeRaw === 'document'
      ? mediaTypeRaw
      : null;
  if (url && mediaType) {
    const { WhatsAppEngine } = await import('../providers/whatsapp-engine');
    const workspace = await prisma.workspace.findUnique({ where: { id: state.workspaceId } });

    if (workspace) {
      await WhatsAppEngine.sendMedia(workspace, state.user, mediaType, url, caption);
    } else {
      deps.log.error('workspace_not_found_for_media', { workspaceId: state.workspaceId });
    }
  }
  return node.next ?? 'END';
}

export async function executeVoiceNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const text = readString(node.data, 'text');
  const voiceId = readString(node.data, 'voiceId');
  if (text && voiceId) {
    deps.log.info('generating_voice', { user: state.user, voiceId });

    const job = await prisma.voiceJob.create({
      data: {
        workspaceId: state.workspaceId,
        profileId: voiceId,
        text: text,
        status: 'PENDING',
      },
    });

    const { enqueueVoiceJob } = await import('../flow-engine-voice-producer');
    await enqueueVoiceJob(job.id, state.workspaceId, text, voiceId);

    const voiceJob = await pollUntil({
      timeoutMs: 45_000,
      intervalMs: 1_000,
      read: () =>
        prisma.voiceJob.findFirst({
          where: { id: job.id, workspaceId: state.workspaceId },
        }),
      stop: (updated) => updated?.status === 'COMPLETED' || updated?.status === 'FAILED',
      sleep: (ms) => deps.sleep(ms),
    });
    const audioUrl = voiceJob?.status === 'COMPLETED' ? voiceJob.outputUrl : null;
    if (voiceJob?.status === 'FAILED') {
      deps.log.error('voice_generation_failed', { jobId: job.id });
    }

    if (audioUrl) {
      const { WhatsAppEngine } = await import('../providers/whatsapp-engine');
      const workspace = await prisma.workspace.findUnique({
        where: { id: state.workspaceId },
      });

      if (workspace) {
        await WhatsAppEngine.sendMedia(workspace, state.user, 'audio', audioUrl);
      } else {
        deps.log.error('workspace_not_found_for_voice', { workspaceId: state.workspaceId });
      }
    } else {
      throw new Error('Timeout generating voice audio');
    }
  }
  return node.next ?? 'END';
}

export async function executeWaitForReplyNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const lastUserMessage = state.variables.last_user_message;
  let pendingMessage: string | undefined =
    typeof lastUserMessage === 'string' ? lastUserMessage : undefined;

  if (!pendingMessage) {
    try {
      const lpopped = await redis.lpop(`reply:${state.user}`);
      pendingMessage = lpopped ?? undefined;
      if (pendingMessage) {
        state.variables.last_user_message = pendingMessage;
      }
    } catch (err) {
      deps.log.error('waitforreply_lpop_error', {
        user: state.user,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (pendingMessage) {
    state.variables.last_user_message = undefined;
    state.waitingForResponse = false;
    state.timeoutAt = undefined;
    return node.yes || node.next || 'END';
  }

  if (state.variables.timeout_triggered) {
    state.variables.timeout_triggered = undefined;
    state.waitingForResponse = false;
    state.timeoutAt = undefined;
    return node.no || node.next || 'END';
  }

  state.waitingForResponse = true;
  const timeoutValue = readNumber(node.data, 'timeoutValue', 1);
  const timeoutUnit = readString(node.data, 'timeoutUnit', 'hours').toLowerCase();
  let timeoutMs: number;
  switch (timeoutUnit) {
    case 'seconds':
      timeoutMs = timeoutValue * 1000;
      break;
    case 'minutes':
      timeoutMs = timeoutValue * 60 * 1000;
      break;
    case 'hours':
      timeoutMs = timeoutValue * 3600 * 1000;
      break;
    case 'days':
      timeoutMs = timeoutValue * 86400 * 1000;
      break;
    default:
      timeoutMs = timeoutValue * 3600 * 1000;
  }
  state.timeoutAt = Date.now() + timeoutMs;
  await deps.context.zadd(
    'timeouts',
    state.timeoutAt,
    deps.timeoutMember(state.user, state.workspaceId),
  );
  return 'WAIT';
}
