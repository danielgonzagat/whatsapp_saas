import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InboxService } from '../inbox/inbox.service';
import { ApiKeyGuard } from './api-key.guard';

/** Public api controller. */
@ApiTags('Public API v1')
@ApiSecurity('x-api-key')
@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly inbox: InboxService) {}

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
  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  async sendMessage(@Request() req, @Body() body: { phone: string; message: string }) {
    // Uses the existing InboxService to send/save
    return this.inbox.saveMessageByPhone({
      workspaceId: req.user.workspaceId,
      phone: body.phone,
      content: body.message,
      direction: 'OUTBOUND',
      type: 'TEXT',
    });
  }
}
