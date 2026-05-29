import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { ChannelMessageDispatchService } from '../../marketing/channel-message-dispatch.service';

export interface MessagingBaseArgs {
  to: string;
  message?: string;
  [key: string]: unknown;
}

export interface MessagingAudioArgs extends MessagingBaseArgs {
  audioUrl: string;
  caption?: string;
}

export interface MessagingDocumentArgs extends MessagingBaseArgs {
  documentUrl: string;
  filename?: string;
  caption?: string;
}

export interface MessagingVoiceNoteArgs extends MessagingBaseArgs {
  audioUrl: string;
}

/**
 * MessagingService — thin façade over ChannelMessageDispatchService for
 * WhatsApp media sends. Resolves the domainService aliases:
 *
 *   - MessagingService.sendWhatsApp   → plain text WhatsApp
 *   - MessagingService.sendAudio      → WhatsApp media (audio)
 *   - MessagingService.sendDocument   → WhatsApp media (document)
 *   - MessagingService.sendVoiceNote  → WhatsApp media (audio/ptt)
 *
 * All calls delegate to ChannelMessageDispatchService.dispatch — no duplicate
 * send logic here.
 *
 * Workspace isolation: workspaceId passed through to the dispatch façade.
 */
@Injectable()
export class MessagingService {
  private readonly logger = StructuredLogger.from(MessagingService.name);

  constructor(private readonly dispatch: ChannelMessageDispatchService) {}

  /** Send a plain WhatsApp text message. */
  async sendWhatsApp(
    workspaceId: string,
    args: MessagingBaseArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const to = String(args.to ?? '');
    const message = String(args.message ?? '');
    if (!to || !message) return { success: false, data: null };

    const result = await this.dispatch.dispatch(workspaceId, 'whatsapp', to, message);
    this.logger.log(`MessagingService.sendWhatsApp ws=${workspaceId} to=${to}`);
    return { success: result.success, data: result };
  }

  /** Send an audio file via WhatsApp. */
  async sendAudio(
    workspaceId: string,
    args: MessagingAudioArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const to = String(args.to ?? '');
    const audioUrl = String(args.audioUrl ?? '');
    if (!to || !audioUrl) return { success: false, data: null };

    const result = await this.dispatch.dispatch(
      workspaceId,
      'whatsapp',
      to,
      args.caption ?? '',
      { mediaUrl: audioUrl, mediaType: 'audio' },
    );
    this.logger.log(`MessagingService.sendAudio ws=${workspaceId} to=${to}`);
    return { success: result.success, data: result };
  }

  /** Send a document (PDF, DOCX, etc.) via WhatsApp. */
  async sendDocument(
    workspaceId: string,
    args: MessagingDocumentArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const to = String(args.to ?? '');
    const documentUrl = String(args.documentUrl ?? '');
    if (!to || !documentUrl) return { success: false, data: null };

    const caption = args.caption ?? args.filename ?? '';
    const result = await this.dispatch.dispatch(
      workspaceId,
      'whatsapp',
      to,
      caption,
      { mediaUrl: documentUrl, mediaType: 'document', caption },
    );
    this.logger.log(`MessagingService.sendDocument ws=${workspaceId} to=${to}`);
    return { success: result.success, data: result };
  }

  /** Send a voice note (PTT) via WhatsApp. */
  async sendVoiceNote(
    workspaceId: string,
    args: MessagingVoiceNoteArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const to = String(args.to ?? '');
    const audioUrl = String(args.audioUrl ?? '');
    if (!to || !audioUrl) return { success: false, data: null };

    const result = await this.dispatch.dispatch(workspaceId, 'whatsapp', to, '', {
      mediaUrl: audioUrl,
      mediaType: 'audio',
    });
    this.logger.log(`MessagingService.sendVoiceNote ws=${workspaceId} to=${to}`);
    return { success: result.success, data: result };
  }
}
