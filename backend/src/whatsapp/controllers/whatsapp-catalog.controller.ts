import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { WhatsappService } from '../whatsapp.service';

/** Contacts, chats, catalog, and backlog operational endpoints. */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
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
    return this.whatsappService.listContacts(req.workspaceId);
  }

  /** Create contact. */
  @Post('contacts')
  async createContact(
    @Req() req: AuthenticatedRequest,
    @Body() body: { phone: string; name?: string; email?: string },
  ) {
    return this.whatsappService.createContact(req.workspaceId, body);
  }

  /** Get chats. */
  @Get('chats')
  async getChats(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listChats(req.workspaceId);
  }

  /** Get chat messages. */
  @Get('chats/:chatId/messages')
  async getChatMessages(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string) {
    const limit = Number(req.query?.limit || req.body?.limit || 100) || 100;
    const offset = Number(req.query?.offset || req.body?.offset || 0) || 0;
    const downloadMedia = this.readBooleanQuery(req.query?.downloadMedia, false);
    return this.whatsappService.getChatMessages(req.workspaceId, decodeURIComponent(chatId), {
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
    return this.whatsappService.setPresence(
      req.workspaceId,
      decodeURIComponent(chatId),
      body?.presence,
    );
  }

  /** Get operational backlog report. */
  @Get('backlog/report')
  async getOperationalBacklogReport(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getOperationalBacklogReport(req.workspaceId, {
      limit: this.readNumberQuery(req.query?.limit, 100, 1, 500),
      includeResolved: this.readBooleanQuery(req.query?.includeResolved, false),
    });
  }

  /** Get backlog. */
  @Get('backlog')
  async getBacklog(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getBacklog(req.workspaceId);
  }

  /** Get catalog contacts. */
  // PULSE_OK: internal route, called by worker process for WhatsApp catalog contact listing
  @Get('catalog/contacts')
  async getCatalogContacts(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listCatalogContacts(req.workspaceId, {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      page: this.readNumberQuery(req.query?.page, 1, 1, 10000),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
    });
  }

  /** Get catalog ranking. */
  // PULSE_OK: internal route, called by worker process for WhatsApp catalog purchase ranking
  @Get('catalog/ranking')
  async getCatalogRanking(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listPurchaseProbabilityRanking(req.workspaceId, {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      minLeadScore: this.readNumberQuery(req.query?.minLeadScore, 0, 0, 100),
      minProbabilityScore: this.readNumberQuery(req.query?.minProbabilityScore, 0, 0, 1),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
      excludeBuyers: this.readBooleanQuery(req.query?.excludeBuyers, false),
    });
  }

  /** Trigger catalog refresh. */
  // PULSE_OK: internal route, called by worker process for WhatsApp catalog refresh
  @Post('catalog/refresh')
  async triggerCatalogRefresh(
    @Req() req: AuthenticatedRequest,
    @Body() body: { days?: number; reason?: string },
  ) {
    return this.whatsappService.triggerCatalogRefresh(req.workspaceId, {
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      reason: this.readText(body?.reason, 'manual_catalog_refresh'),
    });
  }

  /** Trigger catalog score. */
  // PULSE_OK: internal route, called by worker process for WhatsApp catalog rescore
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
    return this.whatsappService.triggerCatalogRescore(req.workspaceId, {
      contactId,
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
    return this.whatsappService.triggerBacklogRebuild(req.workspaceId, {
      limit: this.readNumberQuery(body?.limit, 500, 1, 2000),
      reason: this.readText(body?.reason, 'manual_backlog_rebuild'),
    });
  }

  /** Recreate session if invalid. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session recreation
  @Post('session/recreate-if-invalid')
  async recreateSessionIfInvalid(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.recreateSessionIfInvalid(req.workspaceId);
  }

  /** Sync. */
  @Post('sync')
  async sync(@Req() req: AuthenticatedRequest, @Body() body: { reason?: string }) {
    return this.whatsappService.triggerSync(
      req.workspaceId,
      this.readText(body?.reason, 'manual_sync'),
    );
  }
}
