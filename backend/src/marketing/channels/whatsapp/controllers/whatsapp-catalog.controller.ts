import { Body, Controller, Get, GoneException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../../../common/interfaces';
import { resolveWorkspaceId } from '../../../../auth/workspace-access';
import { WhatsappService } from '../whatsapp.service';
import { InternalEndpoint } from '../../../../common/decorators/internal-endpoint.decorator';
import { RouteClass } from '../../../../common/throttler/route-class.decorator';

/** Contacts, chats, catalog, and backlog operational endpoints. */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class WhatsAppCatalogController {
  constructor(private readonly whatsappService: WhatsappService) {}

  private readNumberQuery(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  private readBooleanQuery(value: unknown, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = (typeof value === 'string' ? value : '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private readText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  /** Get contacts. */
  @Get('contacts')
  async getContacts(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listContacts(resolveWorkspaceId(req));
  }

  /** Create contact. */
  @Post('contacts')
  async createContact(
    @Req() req: AuthenticatedRequest,
    @Body() body: { phone: string; name?: string; email?: string },
  ) {
    return this.whatsappService.createContact(resolveWorkspaceId(req), body);
  }

  /** Get chats. */
  @Get('chats')
  async getChats(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listChats(resolveWorkspaceId(req));
  }

  /** Get chat messages. */
  @Get('chats/:chatId/messages')
  async getChatMessages(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string) {
    const body = (req.body ?? {}) as { limit?: unknown; offset?: unknown };
    const limit = Number(req.query?.limit || body.limit || 100) || 100;
    const offset = Number(req.query?.offset || body.offset || 0) || 0;
    const downloadMedia = this.readBooleanQuery(req.query?.downloadMedia, false);
    return this.whatsappService.getChatMessages(resolveWorkspaceId(req), decodeURIComponent(chatId), {
      limit,
      offset,
      downloadMedia,
    });
  }

  /** Set presence. */
  @Post('chats/:chatId/presence')
  async setPresence(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body()
    body: { presence?: 'typing' | 'paused' | 'seen' | 'available' | 'offline' },
  ) {
    if (!body?.presence) {
      return { success: false, reason: 'presence is required' };
    }
    return this.whatsappService.setPresence(
      resolveWorkspaceId(req),
      decodeURIComponent(chatId),
      body.presence,
    );
  }

  /** Get operational backlog report. */
  @Get('backlog/report')
  async getOperationalBacklogReport(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getOperationalBacklogReport(resolveWorkspaceId(req), {
      limit: this.readNumberQuery(req.query?.limit, 100, 1, 500),
      includeResolved: this.readBooleanQuery(req.query?.includeResolved, false),
    });
  }

  /** Get backlog. */
  @Get('backlog')
  async getBacklog(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getBacklog(resolveWorkspaceId(req));
  }

  /** Get catalog contacts. */
  @InternalEndpoint('whatsapp catalog contacts')
  @Get('catalog/contacts')
  async getCatalogContacts(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listCatalogContacts(resolveWorkspaceId(req), {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      page: this.readNumberQuery(req.query?.page, 1, 1, 10000),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
    });
  }

  /** Get catalog ranking. */
  @InternalEndpoint('whatsapp catalog ranking')
  @Get('catalog/ranking')
  async getCatalogRanking(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listPurchaseProbabilityRanking(resolveWorkspaceId(req), {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      minLeadScore: this.readNumberQuery(req.query?.minLeadScore, 0, 0, 100),
      minProbabilityScore: this.readNumberQuery(req.query?.minProbabilityScore, 0, 0, 1),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
      excludeBuyers: this.readBooleanQuery(req.query?.excludeBuyers, false),
    });
  }

  /** Trigger catalog refresh. */
  @InternalEndpoint('whatsapp catalog refresh')
  @Post('catalog/refresh')
  async triggerCatalogRefresh(
    @Req() req: AuthenticatedRequest,
    @Body() body: { days?: number; reason?: string },
  ) {
    return this.whatsappService.triggerCatalogRefresh(resolveWorkspaceId(req), {
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      reason: this.readText(body?.reason, 'manual_catalog_refresh'),
    });
  }

  /** Trigger catalog score. */
  @InternalEndpoint('whatsapp catalog score')
  @Post('catalog/score')
  async triggerCatalogScore(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      contactId?: string;
      days?: number;
      limit?: number;
      reason?: string;
    },
  ) {
    const contactId = this.readText(body?.contactId).trim() || undefined;
    return this.whatsappService.triggerCatalogRescore(resolveWorkspaceId(req), {
      ...(contactId !== undefined ? { contactId } : {}),
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      limit: this.readNumberQuery(body?.limit, 100, 1, 500),
      reason: this.readText(body?.reason, 'manual_catalog_rescore'),
    });
  }

  /** Rebuild backlog. */
  @Post('backlog/rebuild')
  async rebuildBacklog(
    @Req() req: AuthenticatedRequest,
    @Body() body: { limit?: number; reason?: string },
  ) {
    return this.whatsappService.triggerBacklogRebuild(resolveWorkspaceId(req), {
      limit: this.readNumberQuery(body?.limit, 500, 1, 2000),
      reason: this.readText(body?.reason, 'manual_backlog_rebuild'),
    });
  }

  /** Recreate session if invalid. */
  @InternalEndpoint('whatsapp session recreate')
  @Post('session/recreate-if-invalid')
  recreateSessionIfInvalid() {
    throw new GoneException({
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      feature: 'legacy_session_recreate_if_invalid',
      message: 'WhatsApp agora conecta somente pela API oficial da Meta.',
      use: '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
    });
  }

  /** Sync. */
  @Post('sync')
  async sync(@Req() req: AuthenticatedRequest, @Body() body: { reason?: string }) {
    return this.whatsappService.triggerSync(
      resolveWorkspaceId(req),
      this.readText(body?.reason, 'manual_sync'),
    );
  }
}
