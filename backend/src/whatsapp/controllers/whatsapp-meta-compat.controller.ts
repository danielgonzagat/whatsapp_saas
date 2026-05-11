import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';

/**
 * Meta-compat stubs — endpoints that are not supported under the Meta Cloud API
 * provider but must exist for backward compatibility with WAHA-based clients.
 */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
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
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
  @Post('session/link')
  async linkSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sessionName?: string; session?: string },
  ) {
    void req;
    void body;
    const status = await this.providerRegistry.getSessionStatus(req.workspaceId).catch(() => null);
    return this.buildMetaUnsupportedResponse('legacy_session_link', {
      authUrl: status?.authUrl || null,
    });
  }

  /** Claim session. */
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
  @Post('session/claim')
  async claimSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sourceWorkspaceId?: string },
  ) {
    void req;
    void body;
    const status = await this.providerRegistry.getSessionStatus(req.workspaceId).catch(() => null);
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
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
  @Post('session/pause-agent')
  pauseAgent(@Req() req: AuthenticatedRequest, @Body() body: { paused?: boolean }) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('pause_agent');
  }

  /** Reconcile session. */
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
  @Post('session/reconcile')
  reconcileSession(@Req() req: AuthenticatedRequest, @Body() body: { objective?: string }) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_reconcile');
  }

  /** Get session proofs. */
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
  @Get('session/proofs')
  getSessionProofs(@Req() req: AuthenticatedRequest) {
    void req;
    return {
      ...this.buildMetaUnsupportedResponse('session_proofs'),
      proofs: [],
    };
  }

  /** Get session stream token. */
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
  @Post('session/stream-token')
  getSessionStreamToken(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('session_stream_token');
  }

  /** Get session stream health. */
  @Get('session/stream-health')
  async getSessionStreamHealth(@Req() req: AuthenticatedRequest) {
    const providerType = await this.providerRegistry.getProviderType(req.workspaceId);
    return {
      success: true,
      provider: providerType,
      workerAvailable: false,
      degraded: false,
      health: { enabled: false, reason: 'meta_cloud_has_no_browser_stream' },
    };
  }

  /** Run session action turn. */
  // PULSE_OK: internal route, Meta Cloud API compatibility — returns unsupported for cloud-based providers
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
