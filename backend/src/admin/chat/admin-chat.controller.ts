import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminChatService } from './admin-chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Public()
@Controller('admin/chat')
@UseGuards(AdminAuthGuard)
export class AdminChatController {
  constructor(private readonly chat: AdminChatService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  async send(@Body() dto: SendMessageDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.chat.sendMessage({
      adminUserId: admin.id,
      adminRole: admin.role,
      sessionId: dto.sessionId ?? null,
      content: dto.content,
    });
  }

  @Get('sessions')
  async list(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.chat.listSessions(admin.id);
  }

  @Get('sessions/:id')
  async get(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.chat.getSession(admin.id, id);
  }
}
