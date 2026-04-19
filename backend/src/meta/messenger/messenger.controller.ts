import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { MessengerService } from './messenger.service';

@Controller('meta/messenger')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MessengerController {
  constructor(
    private readonly messengerService: MessengerService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  private async resolveMessengerConnection(workspaceId: string, pageId?: string) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    const finalPageId = normalizeMetaGraphSegment(
      pageId || resolved.pageId || '',
      'Messenger page id',
    );
    const finalPageAccessToken = String(resolved.pageAccessToken || '').trim();

    if (!finalPageAccessToken) {
      throw new BadRequestException('meta_messenger_connection_required');
    }

    return {
      pageId: finalPageId,
      pageAccessToken: finalPageAccessToken,
    };
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      pageId: string;
      recipientId: string;
      text?: string;
      mediaType?: string;
      mediaUrl?: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveMessengerConnection(workspaceId, body.pageId);

    if (body.mediaType && body.mediaUrl) {
      return this.messengerService.sendMediaMessage(
        connection.pageId,
        normalizeMetaGraphSegment(body.recipientId, 'Messenger recipient id'),
        body.mediaType,
        body.mediaUrl,
        connection.pageAccessToken,
      );
    }

    return this.messengerService.sendTextMessage(
      connection.pageId,
      normalizeMetaGraphSegment(body.recipientId, 'Messenger recipient id'),
      body.text || '',
      connection.pageAccessToken,
    );
  }

  @Get('conversations')
  async getConversations(
    @Req() req: AuthenticatedRequest,
    @Query('pageId') pageId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveMessengerConnection(workspaceId, pageId);
    return this.messengerService.getConversations(connection.pageId, connection.pageAccessToken);
  }
}
