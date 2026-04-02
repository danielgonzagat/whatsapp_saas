import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MessengerService } from './messenger.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';

@Controller('meta/messenger')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MessengerController {
  constructor(private readonly messengerService: MessengerService) {}

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send')
  async sendMessage(
    @Req() req: any,
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
        body.pageId,
        body.recipientId,
        body.mediaType,
        body.mediaUrl,
        body.pageAccessToken,
      );
    }

    return this.messengerService.sendTextMessage(
      body.pageId,
      body.recipientId,
      body.text || '',
      body.pageAccessToken,
    );
  }

  @Get('conversations')
  async getConversations(
    @Req() req: any,
    @Query('pageId') pageId: string,
    @Query('pageAccessToken') pageAccessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.messengerService.getConversations(pageId, pageAccessToken);
  }
}
