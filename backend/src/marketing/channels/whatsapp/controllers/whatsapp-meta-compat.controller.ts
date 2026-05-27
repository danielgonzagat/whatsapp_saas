import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { InternalEndpoint } from '../../common/decorators/internal-endpoint.decorator';
import { AuthenticatedRequest } from '../../common/interfaces';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { RouteClass } from '../../common/throttler/route-class.decorator';

/**
 * Meta-compat stubs — endpoints that are not supported under the Meta Cloud API
 * provider but must exist for backward compatibility with WAHA-based clients.
 */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class WhatsAppMetaCompatController {
  constructor(private readonly providerRegistry: WhatsAppProviderRegistry) {}

  private buildMetaUnsupportedResponse(feature: string, extra?: Record<string, unknown>) {
    return {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: `${feature}_not_supported_for_meta_cloud`,
      ...(extra || {}),
    };
  }

  /** Link session. */
  @InternalEndpoint('whatsapp session link')
  @Post('session/link')
  async linkSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sessionName?: string; session?: string },
  ) {
    void req;
    void body;
    const status = await this.providerRegistry.getSessionStatus(req.workspaceId!).catch(() => null);
    return this.buildMetaUnsupportedResponse('legacy_session_link', {
      authUrl: status?.authUrl || null,
    });
  }

  /** Claim session. */
  @InternalEndpoint('whatsapp session claim')
  @Post('session/claim')
  async claimSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sourceWorkspaceId?: string },
  ) {
    void req;
    void body;
    const status = await this.providerRegistry.getSessionStatus(req.workspaceId!).catch(() => null);
    return this.buildMetaUnsupportedResponse('legacy_session_claim', {
      authUrl: status?.authUrl || null,
    });
  }

  /** Perform session action. */
  @Post('session/action')
  performSessionAction(
    @Req() req: AuthenticatedRequest,
    @Body() body: { action?: Record<string, unknown> },
  ) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_action');
  }

  /** Takeover. */
  @Post('session/takeover')
  takeover(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('session_takeover');
  }

  /** Resume agent. */
  @Post('session/resume-agent')
  resumeAgent(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('resume_agent');
  }

  /** Pause agent. */
  @InternalEndpoint('whatsapp session pause agent')
  @Post('session/pause-agent')
  pauseAgent(@Req() req: AuthenticatedRequest, @Body() body: { paused?: boolean }) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('pause_agent');
  }

  /** Reconcile session. */
  @InternalEndpoint('whatsapp session reconcile')
  @Post('session/reconcile')
  reconcileSession(@Req() req: AuthenticatedRequest, @Body() body: { objective?: string }) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_reconcile');
  }

  /** Get session proofs. */
  @InternalEndpoint('whatsapp session proofs')
  @Get('session/proofs')
  getSessionProofs(@Req() req: AuthenticatedRequest) {
    void req;
    return {
      ...this.buildMetaUnsupportedResponse('session_proofs'),
      proofs: [],
    };
  }

  /** Get session stream token. */
  @InternalEndpoint('whatsapp session stream token')
  @Post('session/stream-token')
  getSessionStreamToken(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('session_stream_token');
  }

  /** Get session stream health. */
  @InternalEndpoint('whatsapp session stream health')
  @Get('session/stream-health')
  async getSessionStreamHealth(@Req() req: AuthenticatedRequest) {
    const providerType = await this.providerRegistry.getProviderType(req.workspaceId!);
    return {
      success: true,
      provider: providerType,
      workerAvailable: false,
      degraded: false,
      health: { enabled: false, reason: 'meta_cloud_has_no_browser_stream' },
    };
  }

  /** Run session action turn. */
  @InternalEndpoint('whatsapp session action turn')
  @Post('session/action-turn')
  runSessionActionTurn(
    @Req() req: AuthenticatedRequest,
    @Body() body: { objective?: string; dryRun?: boolean; mode?: string },
  ) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_action_turn');
  }
}
