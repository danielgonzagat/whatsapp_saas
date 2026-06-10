import { Body, Controller, Get, Optional, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { TikTokInboxService } from './tiktok-inbox.service';
import { TikTokSendMessageDto } from './dto/tiktok-send-message.dto';
import { ChannelMessageDispatchService } from './channel-message-dispatch.service';
import { isTikTokInboxCanonicalDispatchEnabled } from './tiktok-inbox-canonical-dispatch.flag';

/**
 * TikTok inbox controller. Brings TikTok backend surface to parity with
 * Facebook Messenger (`marketing/facebook-messenger`) and Instagram
 * (`marketing/instagram`) by exposing the four canonical inbox routes:
 *
 *   - GET  /marketing/tiktok/status         — connection + capability snapshot
 *   - GET  /marketing/tiktok/messages       — list inbox messages
 *   - GET  /marketing/tiktok/conversations  — list conversations
 *   - POST /marketing/tiktok/send           — send a direct message
 *
 * Because TikTok DM access is not yet provisioned, every messaging route
 * returns the honest pending shape `{ ok: false, reason: 'channel_pending' }`
 * defined in {@link TikTokInboxService}. The connection status remains real:
 * it is read from `Workspace.providerSettings.tiktok` exactly like the OAuth
 * controller does. No fake payloads, no `Math.random()` data, no hardcoded
 * arrays — this is the "estados honestos" rule from CLAUDE.md.
 */
@Controller('marketing/tiktok')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class TikTokInboxController {
  constructor(
    private readonly tiktokInbox: TikTokInboxService,
    @Optional()
    private readonly canonicalDispatch?: ChannelMessageDispatchService,
  ) {}

  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.tiktokInbox.getStatus(workspaceId);
  }

  @Get('messages')
  async listMessages(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.tiktokInbox.listMessages(workspaceId);
  }

  @Get('conversations')
  async listConversations(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.tiktokInbox.listConversations(workspaceId);
  }

  @Post('send')
  async sendMessage(@Req() req: AuthenticatedRequest, @Body() body: TikTokSendMessageDto) {
    const workspaceId = resolveWorkspaceId(req);

    // ADDITIVE + flag-gated (KLOEL_TIKTOK_INBOX_CANONICAL_DISPATCH, DEFAULT
    // OFF): route the send through the canonical cross-channel dispatch front
    // door so it traverses the registry → TikTokDispatchAdapter, which returns
    // the HONEST blocked result (TikTok has no outbound API). No API is
    // invented. Any throw or missing canonical service falls through to the
    // existing honest-pending tiktokInbox.sendMessage path, unchanged.
    if (isTikTokInboxCanonicalDispatchEnabled() && this.canonicalDispatch) {
      try {
        return await this.canonicalDispatch.dispatch(
          workspaceId,
          'tiktok',
          body.recipientId,
          body.text,
        );
      } catch {
        // DI/build/dispatch failure: fall through to the honest-pending path.
      }
    }

    return this.tiktokInbox.sendMessage(workspaceId, body.recipientId, body.text);
  }
}
