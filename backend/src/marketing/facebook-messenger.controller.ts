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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { normalizeMetaGraphSegment } from '../meta/meta-input.util';
import { FacebookMessengerService } from './facebook-messenger.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

@Controller('marketing/facebook-messenger')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('webhook')
export class FacebookMessengerController {
  constructor(
    private readonly fbMessenger: FacebookMessengerService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  @Post('send')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      pageId?: string;
      recipientPsid: string;
      text: string;
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

    const recipientPsid = normalizeMetaGraphSegment(body.recipientPsid, 'Messenger recipient psid');

    if (!body.text || body.text.trim().length === 0) {
      throw new BadRequestException('message_text_required');
    }

    const accessToken = resolved.pageAccessToken || resolved.accessToken;

    return this.fbMessenger.sendMessage(
      workspaceId,
      pageId,
      recipientPsid,
      body.text.trim(),
      accessToken,
    );
  }

  @Get('messages')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Query('pageId') pageIdQuery: string,
    @Query('limit') limitQuery?: string,
    @Query('before') before?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);

    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }

    const pageId = normalizeMetaGraphSegment(
      pageIdQuery || resolved.pageId || '',
      'Messenger page id',
    );

    const limit = limitQuery ? parseInt(limitQuery, 10) : undefined;

    const options: { limit?: number; before?: string } = {};
    if (limit !== undefined) options.limit = limit;
    if (before !== undefined) options.before = before;

    return this.fbMessenger.getMessages(workspaceId, pageId, options);
  }

  @Get('conversations')
  async getConversations(@Req() req: AuthenticatedRequest, @Query('pageId') pageIdQuery: string) {
    const workspaceId = resolveWorkspaceId(req);
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);

    if (!resolved.accessToken) {
      throw new BadRequestException('meta_connection_required');
    }

    const pageId = normalizeMetaGraphSegment(
      pageIdQuery || resolved.pageId || '',
      'Messenger page id',
    );

    const accessToken = resolved.pageAccessToken || resolved.accessToken;

    return this.fbMessenger.getConversations(pageId, accessToken);
  }

  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.fbMessenger.getStatus(workspaceId);
  }
}
