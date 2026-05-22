import { Inject, Injectable, forwardRef, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import type { IWhatsappMessaging } from '../whatsapp/whatsapp.interfaces';
import { AudioService } from './audio.service';
import type { ToolArgs } from './unified-agent.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { GMAIL_OAUTH_TOKEN } from '../marketing/tokens';
import { ChannelTransportRegistry } from './channel-transport.registry';
import type { ChannelName, ChannelSendResult } from './channel-transport.types';
import { buildUnsubscribeFooterHtml } from '../common/utils/unsubscribe-footer.util';
import { assertCustomerSafe } from './commercial-decision-orchestrator.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import { DailyLimitService } from './daily-limit.service';

import type { UnknownRecord } from '../common/types';

type GmailMailboxPort = {
  sendMessageFromMailbox(workspaceId: string, input: {
    toEmail: string;
    subject: string;
    html: string;
    proactive?: boolean;
  }): Promise<{ sent: boolean; status?: string; messageId?: string }>;
};

/**
 * Handles all send/media/audio/transcription tool actions for the Unified Agent.
 * Centralises actionSendMessage so other action sub-services can delegate to it.
 */
@Injectable()
export class UnifiedAgentActionsMessagingService {
  private readonly logger = StructuredLogger.from(UnifiedAgentActionsMessagingService.name);

  constructor(
    @Inject(forwardRef(() => WHATSAPP_MESSAGING))
    private readonly whatsappService: IWhatsappMessaging,
    private readonly audioService: AudioService,
    private readonly transports: ChannelTransportRegistry,
    private readonly dailyLimit: DailyLimitService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly events?: BrainEventSpineService,
    @Optional() @Inject(GMAIL_OAUTH_TOKEN) private readonly _gmailMailbox?: GmailMailboxPort,
  ) {}

  // ───────── helpers ─────────

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
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

  private resolveChannel(context?: UnknownRecord): ChannelName {
    const rawChannel =
      this.readOptionalText(context?.channel) ||
      this.readOptionalText(context?.sourceChannel) ||
      this.readOptionalText(context?.provider);
    const channel = rawChannel?.toLowerCase();
    if (
      channel === 'instagram' ||
      channel === 'messenger' ||
      channel === 'tiktok' ||
      channel === 'email' ||
      channel === 'whatsapp'
    ) {
      return channel;
    }
    return 'whatsapp';
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

  async sendViaTransport(
    workspaceId: string,
    recipientId: string,
    content: string,
    context?: UnknownRecord,
    extra: UnknownRecord = {},
  ): Promise<ChannelSendResult> {
    const options = this.buildWhatsAppSendOptions(context, extra);
    const result = await this.transports.send(workspaceId, {
      workspaceId,
      channel: this.resolveChannel(context),
      recipientId,
      content,
      ...(options.mediaUrl !== undefined ? { mediaUrl: options.mediaUrl } : {}),
      ...(options.mediaType !== undefined ? { mediaType: options.mediaType } : {}),
      guardContext: context ?? {},
    });

    this.logger.log(
      [
        '[AGENT] Transport result',
        `channel=${this.resolveChannel(context)}`,
        `success=${result.success}`,
        `blocked=${result.blocked}`,
        result.messageId ? `messageId=${result.messageId}` : null,
        result.error ? `error=${result.error}` : null,
        result.blockedReason ? `blockedReason=${result.blockedReason}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    );

    return result;
  }

  // ───────── send actions ─────────

  private resolveGmailMailbox(): GmailMailboxPort | null {
    return this._gmailMailbox ?? null;
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

    const isProactive = this.resolveComplianceMode(context) === 'proactive';

    if (isProactive) {
      const footerCheck = buildUnsubscribeFooterHtml({ email: recipientEmail });
      if (!footerCheck || footerCheck.length < 10) {
        return { success: false, error: 'unsubscribe_footer_unavailable' };
      }
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
      proactive: isProactive,
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
      if (!msgText) {
        return { success: false, error: 'Mensagem é obrigatória' };
      }
      // Transport-boundary safety: refuse any outbound that looks like the
      // orchestrator's internal plan (third-person directive). This is the
      // last line of defense before the message reaches the customer; a
      // failure here cancels the send and surfaces an operator alert rather
      // than degrading silently. See commercial-decision-orchestrator's
      // assertCustomerSafe + composeCustomerMessage for the upstream path.
      try {
        assertCustomerSafe(msgText);
      } catch (guardError: unknown) {
        const reason = guardError instanceof Error ? guardError.message : 'customer-safe-violation';
        if (!isTestEnv) {
          this.logger.error(`[AGENT] Bloqueio anti-instrução: ${reason}`);
        }
        void this.opsAlert?.alertOnCriticalError(
          guardError,
          'UnifiedAgentActionsMessagingService.actionSendMessage.customerSafetyGuard',
        );
        return {
          success: false,
          error: reason,
          customerSafetyViolation: true,
        };
      }

      // P1.4 — per-channel proactive daily limit. Inbound replies skip
      // this check; only proactive outbound decrements the counter.
      const outboundKind = String(context?.outboundKind ?? '').toLowerCase();
      const isReactiveReply =
        outboundKind === 'reply' ||
        outboundKind === 'inbound-reply' ||
        this.resolveComplianceMode(context) === 'reactive';
      if (!isReactiveReply) {
        const resolvedCh = this.resolveChannel(context);
        const limitCheck = await this.dailyLimit.ensureProactiveDailyLimit(workspaceId, resolvedCh);
        if (!limitCheck.allowed) {
          void this.opsAlert?.alertOnCriticalError(
            new Error(`daily-limit-exceeded: ws=${workspaceId} ch=${resolvedCh}`),
            'UnifiedAgentActionsMessagingService.actionSendMessage.dailyLimit',
          );
          void this.events?.record({
            action: 'transport.blocked' as never,
            intent: 'send_message',
            status: 'skipped',
            workspaceId,
            reason: 'channel-daily-limit-exceeded',
            meta: {
              channel: resolvedCh,
              capAtDay: limitCheck.capAtDay,
              remaining: limitCheck.remaining,
            },
          });
          return { success: false, error: 'channel-daily-limit-exceeded' };
        }
      }

      if (this.readText(context?.channel).toLowerCase() === 'email') {
        return this.actionSendEmailMessage(workspaceId, phone, args, context);
      }

      this.logger.log(`[AGENT] Enviando mensagem para ${phone}: "${msgText.substring(0, 50)}..."`);
      const result = await this.sendViaTransport(workspaceId, phone, msgText, context);
      const sendResult: Record<string, unknown> = this.isRecord(result) ? result : {};

      if (sendResult.error) {
        const message = this.readText(sendResult.message, 'send_message_failed');
        if (!isTestEnv) {
          this.logger.error(`[AGENT] Erro ao enviar: ${message}`);
        }
        return { success: false, error: message };
      }

      const delivery = this.readText(sendResult.delivery).toLowerCase();
      const queued = delivery === 'queued';
      const sent =
        delivery === 'sent' ||
        delivery === 'direct' ||
        sendResult?.direct === true ||
        (sendResult.success === true && sendResult.blocked !== true && !queued);
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
      if (!isTestEnv) {
        this.logger.error(`Erro ao enviar mensagem: ${msg}`);
      }
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
      if (!url) {
        return { success: false, error: 'URL da mídia é obrigatória' };
      }
      this.logger.log(`[AGENT] Enviando mídia para ${phone}: ${type} - ${url.substring(0, 50)}...`);
      const result = await this.sendViaTransport(workspaceId, phone, caption, context, {
        mediaUrl: url,
        mediaType: type,
        caption,
      });
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
      if (!text) {
        return { success: false, error: 'Texto é obrigatório para gerar áudio' };
      }
      if (!this.audioService) {
        return { success: false, error: 'Serviço de áudio não disponível' };
      }
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
      if (!text) {
        return { success: false, error: 'Texto é obrigatório para gerar áudio' };
      }
      if (!this.audioService) {
        return { success: false, error: 'Serviço de áudio não disponível' };
      }
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
      if (!this.audioService) {
        return { success: false, error: 'Serviço de áudio não disponível' };
      }
      if (!audioUrl && !audioBase64) {
        return { success: false, error: 'É necessário fornecer audioUrl ou audioBase64' };
      }
      this.logger.log(`[AGENT] Transcrevendo áudio para workspace ${workspaceId}...`);
      let result: { text: string; duration?: number; language: string } | undefined;
      if (audioUrl) {
        result = await this.audioService.transcribeFromUrl(audioUrl, language, workspaceId);
      } else if (audioBase64) {
        result = await this.audioService.transcribeFromBase64(audioBase64, language, workspaceId);
      }
      if (!result?.text) {
        return { success: false, error: 'Transcrição falhou ou retornou vazia' };
      }
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
