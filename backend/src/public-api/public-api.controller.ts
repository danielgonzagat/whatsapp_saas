import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { InboxService } from '../inbox/inbox.service';
import { ApiKeyGuard } from './api-key.guard';

/** Public api controller. */
@ApiTags('Public API v1')
@ApiSecurity('x-api-key')
@Public()
@Controller('api/v1')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class PublicApiController {
  constructor(private readonly inbox: InboxService) {}

  /**
   * Save an outbound message via InboxService. The message is persisted
   * with direction OUTBOUND and the workspace is scoped by the API key.
   *
   * Note: This endpoint only persists the message to the inbox database.
   * Actual WhatsApp delivery must be triggered separately (e.g. via the
   * sendReply flow which invokes WhatsAppService.sendMessage and its
   * built-in PlanLimitsService.trackMessageSend enforcement).
   */
  @Post('messages')
  @ApiOperation({ summary: 'Send a message to a contact' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', example: '5511999999999' },
        message: { type: 'string', example: 'Hello from API!' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Message queued for delivery' })
  async sendMessage(@Request() req, @Body() body: { phone: string; message: string }) {
    return this.inbox.saveMessageByPhone({
      workspaceId: req.user.workspaceId,
      phone: body.phone,
      content: body.message,
      direction: 'OUTBOUND',
      type: 'TEXT',
    });
  }
}
