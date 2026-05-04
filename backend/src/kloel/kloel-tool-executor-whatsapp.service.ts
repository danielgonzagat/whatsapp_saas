import { Injectable, Logger, Optional } from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AudioService } from './audio.service';
import type { ToolResult } from './kloel-tool-executor.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import type {
  ToolCreateWhatsAppContactArgs,
  ToolGetWhatsAppMessagesArgs,
  ToolPaginationArgs,
  ToolSendAudioArgs,
  ToolSendDocumentArgs,
  ToolSendWhatsAppMessageArgs,
  ToolSetWhatsAppPresenceArgs,
  ToolSyncWhatsAppHistoryArgs,
  ToolTranscribeAudioArgs,
} from './kloel-tool-executor.service';

const NON_DIGIT_RE = /\D/g;

/** WhatsApp messaging tool implementations for KloelToolExecutorService. */
@Injectable()
export class KloelToolExecutorWhatsAppService {
  private readonly logger = new Logger(KloelToolExecutorWhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly audioService: AudioService,
    private readonly planLimits: PlanLimitsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async toolConnectWhatsapp(workspaceId: string): Promise<ToolResult> {
    try {
      const result = await this.providerRegistry.startSession(workspaceId);
      if (result.message === 'already_connected')
        return { success: true, connected: true, message: 'WhatsApp já conectado.' };
      if (result.success && result.authUrl)
        return {
          success: true,
          connectionRequired: true,
          authUrl: result.authUrl,
          message: 'Conclua a conexão oficial da Meta para ativar o canal do WhatsApp.',
        };
      return {
        success: !!result.success,
        message:
          result.message ||
          'Não foi possível iniciar a conexão oficial da Meta. Tente novamente em instantes.',
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelToolExecutorWhatsAppService.startSession',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao conectar WhatsApp:', error);
      return { success: false, error: msg };
    }
  }

  async toolGetWhatsAppStatus(workspaceId: string): Promise<ToolResult> {
    const connStatus = await this.providerRegistry.getSessionStatus(workspaceId);
    const connected = connStatus?.connected === true;
    if (connected)
      return {
        success: true,
        connected: true,
        phoneNumber: connStatus?.phoneNumber || null,
        status: connStatus?.status,
        message: `WhatsApp conectado${connStatus?.phoneNumber ? ` (${connStatus.phoneNumber})` : ''}.`,
      };
    return {
      success: true,
      connected: false,
      status: connStatus?.status || 'disconnected',
      authUrl: connStatus?.authUrl || null,
      phoneNumberId: connStatus?.phoneNumberId || null,
      degradedReason: connStatus?.degradedReason || null,
      connectionRequired: true,
      message: 'WhatsApp não conectado. Conclua a conexão oficial da Meta para ativar o canal.',
    };
  }

  async toolSendWhatsAppMessage(
    workspaceId: string,
    args: ToolSendWhatsAppMessageArgs,
  ): Promise<ToolResult> {
    const { phone, message } = args;
    const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    if (!status.connected)
      return {
        success: false,
        error: 'WhatsApp não está conectado. Conclua a conexão oficial da Meta antes de enviar.',
        authUrl: status.authUrl || null,
      };
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: { contains: normalizedPhone } },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { workspaceId, phone: normalizedPhone, name: 'Via KLOEL' },
      });
    }
    const msg = await this.prisma.message.create({
      data: {
        workspaceId,
        contactId: contact.id,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: message,
        status: 'PENDING',
      },
    });
    try {
      await this.planLimits.ensureDailyMessageQuota(workspaceId);
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, message);
      await this.prisma.message.updateMany({
        where: { id: msg.id, workspaceId },
        data: { status: 'SENT' },
      });
      return {
        success: true,
        messageId: msg.id,
        message: `Mensagem enviada para ${normalizedPhone}.`,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelToolExecutorWhatsAppService.updateMany',
      );
      const errMsg = error instanceof Error ? error.message : 'unknown error';
      await this.prisma.message.updateMany({
        where: { id: msg.id, workspaceId },
        data: { status: 'FAILED' },
      });
      return { success: false, error: `Falha ao enviar mensagem: ${errMsg}` };
    }
  }

  async toolListWhatsAppContacts(
    workspaceId: string,
    args: ToolPaginationArgs,
  ): Promise<ToolResult> {
    const limit = Math.max(1, Math.min(200, Number(args?.limit || 50) || 50));
    const contacts = await this.whatsappService.listContacts(workspaceId);
    return {
      success: true,
      count: contacts.length,
      contacts: contacts.slice(0, limit),
      message:
        contacts.length > 0
          ? `Encontrei ${contacts.length} contato(s) acessíveis no WhatsApp/CRM.`
          : 'Não encontrei contatos acessíveis no momento.',
    };
  }

  async toolCreateWhatsAppContact(
    workspaceId: string,
    args: ToolCreateWhatsAppContactArgs,
  ): Promise<ToolResult> {
    const contact = await this.whatsappService.createContact(workspaceId, {
      phone: args?.phone,
      name: args?.name,
      email: args?.email,
    });
    return {
      success: true,
      contact,
      message: `Contato ${contact.name || contact.phone} pronto para uso pela IA.`,
    };
  }

  async toolListWhatsAppChats(workspaceId: string, args: ToolPaginationArgs): Promise<ToolResult> {
    const limit = Math.max(1, Math.min(200, Number(args?.limit || 50) || 50));
    const chats = await this.whatsappService.listChats(workspaceId);
    const pending = chats.filter((chat) => Number(chat.unreadCount || 0) > 0);
    return {
      success: true,
      count: chats.length,
      pendingConversations: pending.length,
      pendingMessages: pending.reduce((sum, chat) => sum + (Number(chat.unreadCount || 0) || 0), 0),
      chats: chats.slice(0, limit),
      message:
        chats.length > 0
          ? `Encontrei ${chats.length} conversa(s), com ${pending.length} pendente(s).`
          : 'Não encontrei conversas no WhatsApp.',
    };
  }

  async toolGetWhatsAppMessages(
    workspaceId: string,
    args: ToolGetWhatsAppMessagesArgs,
  ): Promise<ToolResult> {
    const chatId = String(args?.chatId || args?.phone || '').trim();
    if (!chatId) return { success: false, error: 'Informe chatId ou phone para ler as mensagens.' };
    const messages = await this.whatsappService.getChatMessages(workspaceId, chatId, {
      limit: Number(args?.limit || 100) || 100,
      offset: Number(args?.offset || 0) || 0,
    });
    return {
      success: true,
      count: messages.length,
      chatId,
      messages,
      message:
        messages.length > 0
          ? `Recuperei ${messages.length} mensagem(ns) da conversa ${chatId}.`
          : `Não encontrei mensagens para ${chatId}.`,
    };
  }

  async toolGetWhatsAppBacklog(workspaceId: string): Promise<ToolResult> {
    const backlog = await this.whatsappService.getBacklog(workspaceId);
    return {
      success: true,
      ...backlog,
      message: backlog.connected
        ? `Há ${backlog.pendingConversations} conversa(s) e ${backlog.pendingMessages} mensagem(ns) pendente(s) no WhatsApp.`
        : 'O WhatsApp ainda não está conectado, então não consigo medir o backlog.',
    };
  }

  async toolSetWhatsAppPresence(
    workspaceId: string,
    args: ToolSetWhatsAppPresenceArgs,
  ): Promise<ToolResult> {
    const chatId = String(args?.chatId || args?.phone || '').trim();
    const presence = String(args?.presence || '').trim() as 'typing' | 'paused' | 'seen';
    if (!chatId) return { success: false, error: 'Informe chatId ou phone para enviar presença.' };
    const result = await this.whatsappService.setPresence(workspaceId, chatId, presence);
    return { success: true, ...result, message: `Presença ${presence} enviada para ${chatId}.` };
  }

  async toolSyncWhatsAppHistory(
    workspaceId: string,
    args: ToolSyncWhatsAppHistoryArgs,
  ): Promise<ToolResult> {
    const sync = await this.whatsappService.triggerSync(
      workspaceId,
      args?.reason || 'kloel_tool_sync',
    );
    return {
      success: true,
      ...sync,
      message: sync.scheduled
        ? 'Sincronização do WhatsApp agendada com sucesso.'
        : `A sincronização não foi agendada: ${sync.reason || 'sem motivo informado'}.`,
    };
  }

  async toolSendAudio(workspaceId: string, args: ToolSendAudioArgs): Promise<ToolResult> {
    const { phone, text, voice = 'nova' } = args;
    if (!phone || !text) return { success: false, error: 'Parâmetros obrigatórios: phone e text' };
    try {
      const audioBuffer = await this.audioService.textToSpeech(text, voice, workspaceId);
      const dataUri = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
      await this.planLimits.ensureDailyMessageQuota(workspaceId);
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, '', {
        mediaUrl: dataUri,
        mediaType: 'audio',
      });
      return { success: true, message: `Áudio enviado para ${normalizedPhone}` };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelToolExecutorWhatsAppService.sendMessage',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao enviar áudio:', error);
      return { success: false, error: msg };
    }
  }

  async toolSendDocument(workspaceId: string, args: ToolSendDocumentArgs): Promise<ToolResult> {
    const { phone, documentName, url, caption } = args;
    if (!phone) return { success: false, error: 'Parâmetro obrigatório: phone' };
    try {
      const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
      let documentUrl = url;
      if (!documentUrl && documentName) {
        const doc = await this.prisma.document?.findFirst({
          where: { workspaceId, name: { contains: documentName, mode: 'insensitive' } },
        });
        documentUrl = doc?.filePath;
      }
      if (!documentUrl)
        return {
          success: false,
          error: 'Documento não encontrado. Forneça URL ou nome cadastrado.',
        };
      await this.planLimits.ensureDailyMessageQuota(workspaceId);
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, caption || '', {
        mediaUrl: documentUrl,
        mediaType: 'document',
        caption,
      });
      return { success: true, message: `Documento enviado para ${normalizedPhone}` };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelToolExecutorWhatsAppService.sendMessage',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao enviar documento:', error);
      return { success: false, error: msg };
    }
  }

  async toolTranscribeAudio(
    workspaceId: string,
    args: ToolTranscribeAudioArgs,
  ): Promise<ToolResult> {
    const { audioUrl, audioBase64, language = 'pt' } = args;
    try {
      let result: { text: string; duration?: number; language: string };
      if (audioUrl) {
        result = await this.audioService.transcribeFromUrl(audioUrl, language, workspaceId);
      } else if (audioBase64) {
        result = await this.audioService.transcribeFromBase64(audioBase64, language, workspaceId);
      } else {
        return { success: false, error: 'Forneça audioUrl ou audioBase64' };
      }
      return { success: true, transcript: result.text, language: result.language };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'KloelToolExecutorWhatsAppService.transcribeFromBase64',
      );
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao transcrever áudio:', error);
      return { success: false, error: msg };
    }
  }
}
