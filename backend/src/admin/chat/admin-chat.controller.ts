import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminGlobalOperation, AdminGlobalOperationGuard } from '../../common/decorators/admin-global-operation.decorator';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminChatService } from './admin-chat.service';
import { AdminChatSessionService } from './admin-chat-session.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import { UpdateChatSessionDto } from './dto/update-chat-session.dto';

/** Admin chat controller. */
@Public()
@Controller('admin/chat')
@UseGuards(AdminAuthGuard, AdminGlobalOperationGuard)
export class AdminChatController {
  constructor(
    private readonly chat: AdminChatService,
    private readonly sessions: AdminChatSessionService,
  ) {}

  /** Send. */
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

  /** List sessions. */
  @Get('sessions')
  @AdminGlobalOperation('admin can audit chat sessions across workspaces')
  async list(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query('workspaceId') workspaceId?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    if (workspaceId) {
      return this.sessions.listSessions({
        workspaceId,
        cursor,
        take: take ? Number(take) : undefined,
      });
    }
    return this.chat.listSessions(admin.id, workspaceId);
  }

  /** Create session. */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateChatSessionDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.sessions.createSession({
      adminUserId: admin.id,
      workspaceId: dto.workspaceId,
      title: dto.title,
    });
  }

  /** Get session. */
  @Get('sessions/:id')
  @AdminGlobalOperation('admin can inspect chat sessions across workspaces')
  async get(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query('workspaceId') workspaceId?: string,
  ) {
    if (workspaceId) {
      return this.sessions.getSession(id, workspaceId);
    }
    return this.chat.getSession(admin.id, id);
  }

  /** Update session. */
  @Patch('sessions/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateChatSessionDto,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.sessions.updateSession({
      id,
      workspaceId,
      title: dto.title,
    });
  }

  /** Delete session. */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    await this.sessions.softDeleteSession({
      id,
      workspaceId,
      adminUserId: admin.id,
    });
  }
}
