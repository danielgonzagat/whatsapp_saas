import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  InboundMessage,
  InboundProcessorService,
} from './inbound-processor.service';
import { WorkspaceService } from '../workspaces/workspace.service';

@Controller('internal/whatsapp-runtime')
export class InternalWhatsAppRuntimeController {
  private readonly logger = new Logger(InternalWhatsAppRuntimeController.name);

  constructor(
    private readonly inboundProcessor: InboundProcessorService,
    private readonly workspaceService: WorkspaceService,
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
    if (expectedInternalKey && internalKey !== expectedInternalKey) {
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
    if (expectedInternalKey && internalKey !== expectedInternalKey) {
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
}
