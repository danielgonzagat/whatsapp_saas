import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { AuthenticatedRequest } from '../common/interfaces';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ChatService } from './chat.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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

  @Post('conversations/:id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub;
    return this.chatService.addMessage(
      resolveWorkspaceId(req),
      id,
      userId,
      'user',
      dto.content,
    );
  }
}
