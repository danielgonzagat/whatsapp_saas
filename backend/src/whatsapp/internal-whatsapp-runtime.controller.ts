import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  InboundMessage,
  InboundProcessorService,
} from './inbound-processor.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/whatsapp-runtime')
export class InternalWhatsAppRuntimeController {
  private readonly logger = new Logger(InternalWhatsAppRuntimeController.name);

  constructor(
    private readonly inboundProcessor: InboundProcessorService,
    private readonly workspaceService: WorkspaceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('inbound')
  @Public()
  async ingestInbound(
    @Body() body: InboundMessage,
    @Headers('x-internal-key') internalKey?: string,
  ) {
    const expectedInternalKey = String(
      process.env.INTERNAL_API_KEY || '',
    ).trim();
    if (!expectedInternalKey) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured');
    }
    if (internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }

    const result = await this.inboundProcessor.process({
      ...body,
      provider: 'whatsapp-web-agent',
      ingestMode: body?.ingestMode || 'live',
    });

    return {
      success: true,
      ...result,
    };
  }

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
    const expectedInternalKey = String(
      process.env.INTERNAL_API_KEY || '',
    ).trim();
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
        whatsappProvider: 'whatsapp-web-agent',
        whatsappApiSession: {
          status: 'connected',
          provider: 'whatsapp-web-agent',
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
    } catch (err: any) {
      this.logger.warn(
        `Failed to auto-activate autopilot for ${workspaceId}: ${err?.message}`,
      );
      return { success: false, reason: err?.message };
    }
  }

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
    const expectedInternalKey = String(
      process.env.INTERNAL_API_KEY || '',
    ).trim();
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

    const normalizedPhone = phone.replace(/\D/g, '');

    try {
      const existing = await this.prisma.contact.findUnique({
        where: {
          workspaceId_phone: { workspaceId, phone: normalizedPhone },
        },
        select: { id: true, customFields: true },
      });

      const now = new Date().toISOString();
      const existingFields =
        (existing?.customFields as Record<string, any>) || {};

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

      this.logger.log(
        `Contact synced: ${name} (${normalizedPhone}) for workspace ${workspaceId}`,
      );

      return { success: true, contactId: contact.id, name, phone: normalizedPhone };
    } catch (err: any) {
      this.logger.warn(
        `Contact sync failed: ${err?.message}`,
      );
      return { success: false, reason: err?.message };
    }
  }
}
