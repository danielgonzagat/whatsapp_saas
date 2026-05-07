import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import { MessengerService } from './messenger.service';

/** Messenger controller. Resolves access token from DB — never accepts it from client. */
@Controller('meta/messenger')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MessengerController {
  constructor(
    private readonly messengerService: MessengerService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      pageId?: string;
      recipientId: string;
      text?: string;
      mediaType?: string;
      mediaUrl?: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    const pageId = normalizeMetaGraphSegment(
      body.pageId || resolved.pageId || '',
      'Messenger page id',
    );

    if (body.mediaType && body.mediaUrl) {
      return this.messengerService.sendMediaMessage(
        pageId,
        normalizeMetaGraphSegment(body.recipientId, 'Messenger recipient id'),
        body.mediaType,
        body.mediaUrl,
        resolved.accessToken,
      );
    }

    return this.messengerService.sendTextMessage(
      pageId,
      normalizeMetaGraphSegment(body.recipientId, 'Messenger recipient id'),
      body.text || '',
      resolved.accessToken,
    );
  }

  /** Get conversations. */
  @Get('conversations')
  async getConversations(@Req() req: AuthenticatedRequest, @Query('pageId') pageId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }
    return this.messengerService.getConversations(
      normalizeMetaGraphSegment(pageId || resolved.pageId || '', 'Messenger page id'),
      resolved.accessToken,
    );
  }
}
