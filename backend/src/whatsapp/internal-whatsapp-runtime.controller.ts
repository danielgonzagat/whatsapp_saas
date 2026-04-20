import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Logger,
  Post,
  Query,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { InboundMessage, InboundProcessorService } from './inbound-processor.service';
import { WhatsappService } from './whatsapp.service';

const D_RE = /\D/g;

/** Internal whats app runtime controller. */
@Controller('internal/whatsapp-runtime')
export class InternalWhatsAppRuntimeController {
  private readonly logger = new Logger(InternalWhatsAppRuntimeController.name);

  constructor(
    private readonly inboundProcessor: InboundProcessorService,
    private readonly workspaceService: WorkspaceService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  /** Ingest inbound. */
  @Post('inbound')
  @Public()
  async ingestInbound(
    @Body() body: InboundMessage,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expectedInternalKey = String(process.env.INTERNAL_API_KEY || '').trim();
    if (!expectedInternalKey) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured');
    }
    if (internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }

    const result = await this.inboundProcessor.process({
      ...body,
      provider: 'meta-cloud',
      ingestMode: body?.ingestMode || 'live',
    });

    return {
      success: true,
      ...result,
    };
  }

  /** Session connected. */
  @Post('session-connected')
  @Public()
  async sessionConnected(
    @Body()
    body: {
      workspaceId: string;
      phoneNumber?: string;
      pushName?: string;
    },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expectedInternalKey = String(process.env.INTERNAL_API_KEY || '').trim();
    if (!expectedInternalKey) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured');
    }
    if (internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }

    const { workspaceId } = body;
    if (!workspaceId) {
      return { success: false, reason: 'missing_workspace_id' };
    }

    try {
      await this.workspaceService.patchSettings(workspaceId, {
        whatsappProvider: 'meta-cloud',
        whatsappApiSession: {
          status: 'connected',
          provider: 'meta-cloud',
          phoneNumber: body.phoneNumber || null,
          pushName: body.pushName || null,
          connectedAt: new Date().toISOString(),
        },
        autonomy: {
          mode: 'LIVE',
          reactiveEnabled: true,
          reason: 'browser_session_connected',
          lastTransitionAt: new Date().toISOString(),
        },
        autopilot: {
          enabled: true,
        },
      });

      this.logger.log(
        `Autopilot auto-activated for workspace ${workspaceId} (browser session connected)`,
      );

      return { success: true, workspaceId, autopilotEnabled: true };
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.warn(
        `Failed to auto-activate autopilot for ${workspaceId}: ${errInstanceofError?.message}`,
      );
      return { success: false, reason: errInstanceofError?.message };
    }
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send-text')
  @Public()
  async sendText(
    @Body()
    body: {
      workspaceId: string;
      to: string;
      message: string;
      quotedMessageId?: string;
      externalId?: string;
    },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternalKey(internalKey);
    return this.whatsappService.sendMessage(body.workspaceId, body.to, body.message, {
      quotedMessageId: body.quotedMessageId,
      externalId: body.externalId,
      forceDirect: true,
    });
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send-media')
  @Public()
  async sendMedia(
    @Body()
    body: {
      workspaceId: string;
      to: string;
      mediaUrl: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      quotedMessageId?: string;
      externalId?: string;
    },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternalKey(internalKey);
    return this.whatsappService.sendMessage(body.workspaceId, body.to, body.caption || '', {
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaType,
      caption: body.caption,
      quotedMessageId: body.quotedMessageId,
      externalId: body.externalId,
      forceDirect: true,
    });
  }

  /** Get status. */
  @Get('status')
  @Public()
  async getStatus(
    @Query('workspaceId') workspaceId: string,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternalKey(internalKey);
    return this.whatsappService.getConnectionStatus(workspaceId);
  }

  /** Get chats. */
  @Get('chats')
  @Public()
  async getChats(
    @Query('workspaceId') workspaceId: string,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternalKey(internalKey);
    return this.whatsappService.listChats(workspaceId);
  }

  /** Get messages. */
  @Get('messages')
  @Public()
  async getMessages(
    @Query('workspaceId') workspaceId: string,
    @Query('chatId') chatId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternalKey(internalKey);
    const clampedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
    const clampedOffset = Math.max(Number(offset) || 0, 0);
    return this.whatsappService.getChatMessages(workspaceId, chatId, {
      limit: clampedLimit,
      offset: clampedOffset,
    });
  }

  /** Read chat. */
  @Post('read')
  @Public()
  async readChat(
    @Body() body: { workspaceId: string; chatId: string },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    this.assertInternalKey(internalKey);
    return this.whatsappService.setPresence(body.workspaceId, body.chatId, 'seen');
  }

  /** Sync contact. */
  @Post('sync-contact')
  @Public()
  async syncContact(
    @Body()
    body: {
      workspaceId: string;
      phone: string;
      name: string;
    },
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expectedInternalKey = String(process.env.INTERNAL_API_KEY || '').trim();
    if (!expectedInternalKey) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured');
    }
    if (internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }

    const { workspaceId, phone, name } = body;
    if (!workspaceId || !phone || !name) {
      return { success: false, reason: 'missing_fields' };
    }

    const normalizedPhone = phone.replace(D_RE, '');

    try {
      const existing = await this.prisma.contact.findUnique({
        where: {
          workspaceId_phone: { workspaceId, phone: normalizedPhone },
        },
        select: { id: true, customFields: true },
      });

      const now = new Date().toISOString();
      const existingFields = (existing?.customFields as Record<string, unknown>) || {};

      const contact = await this.prisma.contact.upsert({
        where: {
          workspaceId_phone: { workspaceId, phone: normalizedPhone },
        },
        update: {
          name,
          customFields: {
            ...existingFields,
            remotePushName: name,
            remotePushNameUpdatedAt: now,
            whatsappSavedAt: now,
            nameResolutionStatus: 'resolved',
          },
        },
        create: {
          workspaceId,
          phone: normalizedPhone,
          name,
          customFields: {
            remotePushName: name,
            remotePushNameUpdatedAt: now,
            whatsappSavedAt: now,
            nameResolutionStatus: 'resolved',
          },
        },
      });

      this.logger.log(`Contact synced: ${name} (${normalizedPhone}) for workspace ${workspaceId}`);

      return {
        success: true,
        contactId: contact.id,
        name,
        phone: normalizedPhone,
      };
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.warn(`Contact sync failed: ${errInstanceofError?.message}`);
      return { success: false, reason: errInstanceofError?.message };
    }
  }

  private assertInternalKey(internalKey?: string) {
    const expectedInternalKey = String(process.env.INTERNAL_API_KEY || '').trim();
    if (!expectedInternalKey) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured');
    }
    if (internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }
  }
}
