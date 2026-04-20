import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import { MessengerService } from './messenger.service';

/** Messenger controller. */
@Controller('meta/messenger')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MessengerController {
  constructor(private readonly messengerService: MessengerService) {}

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
      pageAccessToken: string;
    },
  ) {
    resolveWorkspaceId(req);

    if (body.mediaType && body.mediaUrl) {
      return this.messengerService.sendMediaMessage(
        normalizeMetaGraphSegment(body.pageId, 'Messenger page id'),
        normalizeMetaGraphSegment(body.recipientId, 'Messenger recipient id'),
        body.mediaType,
        body.mediaUrl,
        body.pageAccessToken,
      );
    }

    return this.messengerService.sendTextMessage(
      normalizeMetaGraphSegment(body.pageId, 'Messenger page id'),
      normalizeMetaGraphSegment(body.recipientId, 'Messenger recipient id'),
      body.text || '',
      body.pageAccessToken,
    );
  }

  @Get('conversations')
  async getConversations(
    @Req() req: AuthenticatedRequest,
    @Query('pageId') pageId: string,
    @Query('pageAccessToken') pageAccessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.messengerService.getConversations(
      normalizeMetaGraphSegment(pageId, 'Messenger page id'),
      pageAccessToken,
    );
  }
}
