export const NON_DIGIT_RE = /\D/g;

/** Generic tool result shape. */
export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}
export interface ToolSendWhatsAppMessageArgs {
  phone: string;
  message: string;
}
export interface ToolPaginationArgs {
  limit?: number;
}
export interface ToolCreateWhatsAppContactArgs {
  phone: string;
  name?: string;
  email?: string;
}
export interface ToolGetWhatsAppMessagesArgs {
  chatId?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}
export interface ToolSetWhatsAppPresenceArgs {
  chatId?: string;
  phone?: string;
  presence?: 'typing' | 'paused' | 'seen';
}
export interface ToolSyncWhatsAppHistoryArgs {
  reason?: string;
}
export interface ToolSendAudioArgs {
  phone: string;
  text: string;
  voice?: string;
}
export interface ToolSendDocumentArgs {
  phone: string;
  documentName?: string;
  url?: string;
  caption?: string;
}
export interface ToolTranscribeAudioArgs {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
}

// ── Media send helpers ──

export async function toolSendAudio(
  deps: {
    audioService: any;
    planLimits: any;
    whatsappService: any;
    logger: any;
    opsAlert?: any;
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
    const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
    await deps.planLimits.ensureDailyMessageQuota(workspaceId);
    await deps.whatsappService.sendMessage(workspaceId, normalizedPhone, '', {
      mediaUrl: dataUri,
      mediaType: 'audio',
    });
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
    prisma: any;
    planLimits: any;
    whatsappService: any;
    logger: any;
    opsAlert?: any;
  },
  workspaceId: string,
  args: ToolSendDocumentArgs,
): Promise<ToolResult> {
  const { phone, documentName, url, caption } = args;
  if (!phone) return { success: false, error: 'Parâmetro obrigatório: phone' };
  try {
    const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
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
    await deps.whatsappService.sendMessage(workspaceId, normalizedPhone, caption || '', {
      mediaUrl: documentUrl,
      mediaType: 'document',
      caption,
    });
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
