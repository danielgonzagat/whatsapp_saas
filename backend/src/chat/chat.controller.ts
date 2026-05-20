import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { AuthenticatedRequest } from '../common/interfaces';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ChatService } from './chat.service';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { RouteClass } from '../common/throttler/route-class.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
/**
 * @cluster whatsapp_saas/backend/chat
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @InternalEndpoint('chat conversation messages')
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') id: string,
    @Query() query: GetMessagesQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chatService.getMessages(
      resolveWorkspaceId(req),
      id,
      query.cursor,
      query.limit ?? 50,
    );
  }

  @InternalEndpoint('chat send message')
  @Post('conversations/:id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub;
    return this.chatService.addMessage(resolveWorkspaceId(req), id, userId, 'user', dto.content);
  }
}
