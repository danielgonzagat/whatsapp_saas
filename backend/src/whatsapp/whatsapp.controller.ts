import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { WhatsappService } from './whatsapp.service';

import { RouteClass } from '../common/throttler/route-class.decorator';
type LegacySendBody = {
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  externalId?: string;
};

type LegacyIncomingBody = {
  from: string;
  message: string;
};

type LegacyBulkBody = {
  phones?: string[];
};

/**
 * Camada de compatibilidade para contratos antigos /whatsapp/:workspaceId/*
 * enquanto o runtime interno permanece WAHA-only.
 */
@Controller('whatsapp/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  private resolveWorkspaceId(req: AuthenticatedRequest, workspaceId: string) {
    return req?.workspaceId || workspaceId;
  }

  /** Send. */
  @Post('send')
  @Idempotent()
  async send(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: LegacySendBody,
  ) {
    const resolvedWorkspaceId = this.resolveWorkspaceId(req, workspaceId);
    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    return this.whatsappService.sendMessage(resolvedWorkspaceId, body?.to, body?.message, {
      ...(body?.mediaUrl !== undefined ? { mediaUrl: body.mediaUrl } : {}),
      ...(body?.mediaType !== undefined ? { mediaType: body.mediaType } : {}),
      ...(body?.caption !== undefined ? { caption: body.caption } : {}),
      ...(body?.externalId !== undefined ? { externalId: body.externalId } : {}),
    });
  }

  /** Incoming. */
  @Post('incoming')
  @Idempotent()
  async incoming(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: LegacyIncomingBody,
  ) {
    const resolvedWorkspaceId = this.resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.handleIncoming(resolvedWorkspaceId, body?.from, body?.message);
  }

  /** Opt in bulk. */
  @Post('opt-in/bulk')
  @Idempotent()
  async optInBulk(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: LegacyBulkBody,
  ) {
    const resolvedWorkspaceId = this.resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.optInBulk(resolvedWorkspaceId, body?.phones || []);
  }

  /** Opt out bulk. */
  @Post('opt-out/bulk')
  @Idempotent()
  async optOutBulk(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: LegacyBulkBody,
  ) {
    const resolvedWorkspaceId = this.resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.optOutBulk(resolvedWorkspaceId, body?.phones || []);
  }

  /** Get opt status. */
  @Get('opt-status/:phone')
  async getOptStatus(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('phone') phone: string,
  ) {
    const resolvedWorkspaceId = this.resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.getOptInStatus(resolvedWorkspaceId, phone);
  }
}
