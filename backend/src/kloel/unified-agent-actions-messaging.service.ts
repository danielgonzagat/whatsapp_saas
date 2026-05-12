import { Inject, Injectable, Logger, forwardRef, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import type { IWhatsappMessaging } from '../whatsapp/whatsapp.interfaces';
import { AudioService } from './audio.service';
import type { ToolArgs } from './unified-agent.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MailboxGmailOAuthService } from '../marketing/mailbox-gmail-oauth.service';

type UnknownRecord = Record<string, unknown>;

/**
 * Handles all send/media/audio/transcription tool actions for the Unified Agent.
 * Centralises actionSendMessage so other action sub-services can delegate to it.
 */
@Injectable()
export class UnifiedAgentActionsMessagingService {
  private readonly logger = new Logger(UnifiedAgentActionsMessagingService.name);

  constructor(
    @Inject(forwardRef(() => WHATSAPP_MESSAGING))
    private readonly whatsappService: IWhatsappMessaging,
    private readonly audioService: AudioService,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  // ───────── helpers ─────────

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return String(value);
    return fallback;
  }

  private readOptionalText(value: unknown): string | undefined {
    const normalized = this.readText(value).trim();
    return normalized || undefined;
  }

  str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  resolveComplianceMode(context?: UnknownRecord): 'reactive' | 'proactive' {
    return context?.deliveryMode === 'reactive' ? 'reactive' : 'proactive';
  }

  buildWhatsAppSendOptions(
    context?: UnknownRecord,
    extra: UnknownRecord = {},
  ): {
    mediaUrl?: string;
    mediaType?: 'document' | 'image' | 'audio' | 'video';
    caption?: string;
    externalId?: string;
    complianceMode: 'reactive' | 'proactive';
    forceDirect: boolean;
    quotedMessageId?: string;
  } {
    const extraRecord = this.isRecord(extra) ? extra : {};
    const mediaType = this.readOptionalText(extraRecord.mediaType);
    const quotedMessageId =
      this.readOptionalText(extraRecord.quotedMessageId) ||
      this.readOptionalText(context?.quotedMessageId) ||
      this.readOptionalText(context?.providerMessageId);

    const resolvedMediaUrl = this.readOptionalText(extraRecord.mediaUrl);
    const resolvedMediaType =
      mediaType === 'document' ||
      mediaType === 'image' ||
      mediaType === 'audio' ||
      mediaType === 'video'
        ? mediaType
        : undefined;
    const resolvedCaption = this.readOptionalText(extraRecord.caption);
    const resolvedExternalId = this.readOptionalText(extraRecord.externalId);

    return {
      ...(resolvedMediaUrl !== undefined ? { mediaUrl: resolvedMediaUrl } : {}),
      ...(resolvedMediaType !== undefined ? { mediaType: resolvedMediaType } : {}),
      ...(resolvedCaption !== undefined ? { caption: resolvedCaption } : {}),
      ...(resolvedExternalId !== undefined ? { externalId: resolvedExternalId } : {}),
      ...(quotedMessageId !== undefined ? { quotedMessageId } : {}),
      complianceMode: this.resolveComplianceMode(context),
      forceDirect: context?.forceDirect === true,
    };
  }

  // ───────── send actions ─────────

  private resolveGmailMailbox(): MailboxGmailOAuthService | null {
    if (!this.moduleRef) {
      return null;
    }
    try {
      return this.moduleRef.get(MailboxGmailOAuthService, { strict: false });
    } catch {
      return null;
    }
  }

  private async actionSendEmailMessage(
    workspaceId: string,
    recipientEmail: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    const gmailMailbox = this.resolveGmailMailbox();
    if (!gmailMailbox) {
      return { success: false, error: 'gmail_mailbox_not_available' };
    }

    const message = this.str(args.message);
    if (!message) {
      return { success: false, error: 'Mensagem é obrigatória' };
    }

    const metadata = this.isRecord(context?.metadata) ? context.metadata : {};
    const subject =
      this.readOptionalText(args.subject) ||
      this.readOptionalText(metadata.subject) ||
      'Resposta Kloel CIA';
    const result = await gmailMailbox.sendMessageFromMailbox(workspaceId, {
      toEmail: recipientEmail,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      html: `<p>${this.escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      proactive: this.resolveComplianceMode(context) === 'proactive',
    });

    return {
      success: Boolean(result.sent),
      sent: Boolean(result.sent),
      delivery: result.sent ? 'sent' : result.status,
      message,
      provider: 'gmail',
      messageId: result.messageId,
    };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  async actionSendMessage(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      const msgText = this.str(args.message);
      if (!msgText) return { success: false, error: 'Mensagem é obrigatória' };

      if (this.readText(context?.channel).toLowerCase() === 'email') {
        return this.actionSendEmailMessage(workspaceId, phone, args, context);
      }

      this.logger.log(`[AGENT] Enviando mensagem para ${phone}: "${msgText.substring(0, 50)}..."`);
      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        msgText,
        this.buildWhatsAppSendOptions(context),
      );
      const sendResult: Record<string, unknown> = this.isRecord(result) ? result : {};

      if (sendResult.error) {
        const message = this.readText(sendResult.message, 'send_message_failed');
        if (!isTestEnv) this.logger.error(`[AGENT] Erro ao enviar: ${message}`);
        return { success: false, error: message };
      }

      const delivery = this.readText(sendResult.delivery).toLowerCase();
      const queued = delivery === 'queued';
      const sent = delivery === 'sent' || delivery === 'direct' || sendResult?.direct === true;
      this.logger.log(
        `[AGENT] Mensagem ${queued ? 'enfileirada' : 'enviada'} com sucesso para ${phone}`,
      );
      return {
        success: true,
        message: msgText,
        queued,
        sent,
        delivery: queued ? 'queued' : 'sent',
        direct: sendResult?.direct === true,
        messageId: sendResult?.messageId,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsMessagingService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      if (!isTestEnv) this.logger.error(`Erro ao enviar mensagem: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionSendMedia(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const type = this.str(args.type, 'image');
      const url = this.str(args.url);
      const caption = this.str(args.caption);
      if (!url) return { success: false, error: 'URL da mídia é obrigatória' };
      this.logger.log(`[AGENT] Enviando mídia para ${phone}: ${type} - ${url.substring(0, 50)}...`);
      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        caption,
        this.buildWhatsAppSendOptions(context, { mediaUrl: url, mediaType: type, caption }),
      );
      const sendResult: Record<string, unknown> = this.isRecord(result) ? result : {};
      if (sendResult.error) {
        const message = this.readText(sendResult.message, 'send_media_failed');
        this.logger.error(`[AGENT] Erro ao enviar mídia: ${message}`);
        return { success: false, error: message };
      }
      this.logger.log(`[AGENT] Mídia enviada com sucesso para ${phone}`);
      return { success: true, type, url, caption, sent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsMessagingService.actionSendMedia',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao enviar mídia: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionSendVoiceNote(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const text = this.str(args.text);
      const voice = this.str(args.voice, 'nova');
      if (!text) return { success: false, error: 'Texto é obrigatório para gerar áudio' };
      if (!this.audioService) return { success: false, error: 'Serviço de áudio não disponível' };
      this.logger.log(`[AGENT] Gerando áudio TTS para ${phone}: "${text.substring(0, 50)}..."`);
      const audioBuffer = await this.audioService.textToSpeech(text, voice, workspaceId);
      const base64Audio = audioBuffer.toString('base64');
      const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;
      this.logger.log(`[AGENT] Enviando nota de voz para ${phone}...`);
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        '',
        this.buildWhatsAppSendOptions(context, { mediaUrl: audioDataUrl, mediaType: 'audio' }),
      );
      const sendResult: Record<string, unknown> = this.isRecord(result) ? result : {};
      if (sendResult.error) {
        const message = this.readText(sendResult.message, 'send_voice_failed');
        this.logger.error(`[AGENT] Erro ao enviar áudio: ${message}`);
        return { success: false, error: message };
      }
      this.logger.log(`[AGENT] Nota de voz enviada com sucesso para ${phone}`);
      return { success: true, text, voice, sent: true, audioSize: audioBuffer.length };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsMessagingService.actionSendVoiceNote',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao enviar nota de voz: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionSendAudio(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const text = this.str(args.text);
      const voice = this.str(args.voice, 'nova');
      if (!text) return { success: false, error: 'Texto é obrigatório para gerar áudio' };
      if (!this.audioService) return { success: false, error: 'Serviço de áudio não disponível' };
      this.logger.log(`[AGENT] Gerando áudio para ${phone}: "${text.substring(0, 80)}..."`);
      const audioBuffer = await this.audioService.textToSpeech(text, voice, workspaceId);
      const base64Audio = audioBuffer.toString('base64');
      const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        '',
        this.buildWhatsAppSendOptions(context, { mediaUrl: audioDataUrl, mediaType: 'audio' }),
      );
      const sendResult: Record<string, unknown> = this.isRecord(result) ? result : {};
      if (sendResult.error) {
        const message = this.readText(sendResult.message, 'send_audio_failed');
        this.logger.error(`[AGENT] Erro ao enviar áudio: ${message}`);
        return { success: false, error: message };
      }
      this.logger.log(`[AGENT] Áudio enviado para ${phone}`);
      return { success: true, text, voice, sent: true, audioSize: audioBuffer.length };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsMessagingService.actionSendAudio',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao enviar áudio: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionTranscribeAudio(workspaceId: string, args: ToolArgs) {
    try {
      const audioUrl = this.str(args.audioUrl);
      const audioBase64 = this.str(args.audioBase64);
      const language = this.str(args.language, 'pt');
      if (!this.audioService) return { success: false, error: 'Serviço de áudio não disponível' };
      if (!audioUrl && !audioBase64)
        return { success: false, error: 'É necessário fornecer audioUrl ou audioBase64' };
      this.logger.log(`[AGENT] Transcrevendo áudio para workspace ${workspaceId}...`);
      let result: { text: string; duration?: number; language: string } | undefined;
      if (audioUrl)
        result = await this.audioService.transcribeFromUrl(audioUrl, language, workspaceId);
      else if (audioBase64)
        result = await this.audioService.transcribeFromBase64(audioBase64, language, workspaceId);
      if (!result?.text) return { success: false, error: 'Transcrição falhou ou retornou vazia' };
      this.logger.log(`[AGENT] Transcrição concluída: "${result.text.substring(0, 100)}..."`);
      return {
        success: true,
        text: result.text,
        duration: result.duration,
        language: result.language,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsMessagingService.actionTranscribeAudio',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao transcrever áudio: ${msg}`);
      return { success: false, error: msg };
    }
  }
}
