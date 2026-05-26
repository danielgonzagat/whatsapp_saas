import type { PrismaClient } from '@prisma/client';

import type {
  ToolResult,
  ToolSendWhatsAppMessageArgs,
  ToolPaginationArgs,
  ToolCreateWhatsAppContactArgs,
  ToolGetWhatsAppMessagesArgs,
  ToolSetWhatsAppPresenceArgs,
  ToolSyncWhatsAppHistoryArgs,
  ToolSendAudioArgs,
  ToolSendDocumentArgs,
  ToolTranscribeAudioArgs,
} from './kloel-tool-executor.types';
import { digitsOnly } from '../common/phone';

// All 10 types live canonically in kloel-tool-executor.types — re-export to
// keep the existing kloel-whatsapp-tools.service public surface intact.
export type {
  ToolResult,
  ToolSendWhatsAppMessageArgs,
  ToolPaginationArgs,
  ToolCreateWhatsAppContactArgs,
  ToolGetWhatsAppMessagesArgs,
  ToolSetWhatsAppPresenceArgs,
  ToolSyncWhatsAppHistoryArgs,
  ToolSendAudioArgs,
  ToolSendDocumentArgs,
  ToolTranscribeAudioArgs,
};

interface AudioServiceClient {
  textToSpeech(text: string, voice?: string, workspaceId?: string): Promise<Buffer>;
}

interface PlanLimitsClient {
  ensureDailyMessageQuota(workspaceId: string): Promise<unknown>;
}

interface ChannelTransportClient {
  send(
    workspaceId: string,
    request: {
      workspaceId: string;
      channel: 'whatsapp';
      recipientId: string;
      content: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
    },
  ): Promise<{ success: boolean; error?: string; blockedReason?: string }>;
}

interface LoggerClient {
  error(message: string, error?: unknown): void;
}

interface OpsAlertClient {
  alertOnCriticalError(
    error: unknown,
    context: string,
    extra?: { workspaceId?: string; metadata?: Record<string, unknown> },
  ): Promise<void>;
}

interface DocumentPrismaDelegate {
  document?: PrismaClient['document'];
}

export async function toolSendAudio(
  deps: {
    audioService: AudioServiceClient;
    planLimits: PlanLimitsClient;
    transports: ChannelTransportClient;
    logger: LoggerClient;
    opsAlert?: OpsAlertClient;
  },
  workspaceId: string,
  args: ToolSendAudioArgs,
): Promise<ToolResult> {
  const { phone, text, voice = 'nova' } = args;
  if (!phone || !text) {
    return { success: false, error: 'Parâmetros obrigatórios: phone e text' };
  }
  try {
    const audioBuffer = await deps.audioService.textToSpeech(text, voice, workspaceId);
    const dataUri = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
    const normalizedPhone = digitsOnly(phone);
    await deps.planLimits.ensureDailyMessageQuota(workspaceId);
    const send = await deps.transports.send(workspaceId, {
      workspaceId,
      channel: 'whatsapp',
      recipientId: normalizedPhone,
      content: '',
      mediaUrl: dataUri,
      mediaType: 'audio',
    });
    if (!send.success) {
      return {
        success: false,
        error: send.blockedReason || send.error || 'Falha ao enviar áudio',
      };
    }
    return { success: true, message: `Áudio enviado para ${normalizedPhone}` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    deps.logger.error('Erro ao enviar áudio:', error);
    void deps.opsAlert?.alertOnCriticalError(error, 'KloelWhatsAppToolsService.toolSendAudio', {
      workspaceId,
    });
    return { success: false, error: msg };
  }
}

export async function toolSendDocument(
  deps: {
    prisma: DocumentPrismaDelegate;
    planLimits: PlanLimitsClient;
    transports: ChannelTransportClient;
    logger: LoggerClient;
    opsAlert?: OpsAlertClient;
  },
  workspaceId: string,
  args: ToolSendDocumentArgs,
): Promise<ToolResult> {
  const { phone, documentName, url, caption } = args;
  if (!phone) {
    return { success: false, error: 'Parâmetro obrigatório: phone' };
  }
  try {
    const normalizedPhone = digitsOnly(phone);
    let documentUrl = url;
    if (!documentUrl && documentName) {
      const doc = await deps.prisma.document?.findFirst({
        where: { workspaceId, name: { contains: documentName, mode: 'insensitive' } },
      });
      documentUrl = doc?.filePath;
    }
    if (!documentUrl) {
      return {
        success: false,
        error: 'Documento não encontrado. Forneça URL ou nome cadastrado.',
      };
    }
    await deps.planLimits.ensureDailyMessageQuota(workspaceId);
    const send = await deps.transports.send(workspaceId, {
      workspaceId,
      channel: 'whatsapp',
      recipientId: normalizedPhone,
      content: caption || '',
      mediaUrl: documentUrl,
      mediaType: 'document',
      ...(caption !== undefined ? { caption } : {}),
    });
    if (!send.success) {
      return {
        success: false,
        error: send.blockedReason || send.error || 'Falha ao enviar documento',
      };
    }
    return { success: true, message: `Documento enviado para ${normalizedPhone}` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    deps.logger.error('Erro ao enviar documento:', error);
    void deps.opsAlert?.alertOnCriticalError(error, 'KloelWhatsAppToolsService.toolSendDocument', {
      workspaceId,
    });
    return { success: false, error: msg };
  }
}
