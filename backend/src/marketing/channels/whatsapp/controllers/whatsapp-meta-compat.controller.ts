import { Controller, Get, GoneException, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../../../common/guards/workspace.guard';
import { InternalEndpoint } from '../../../../common/decorators/internal-endpoint.decorator';
import { RouteClass } from '../../../../common/throttler/route-class.decorator';

/** Retired non-Meta session endpoints kept only to fail loudly for old clients. */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class WhatsAppMetaCompatController {
  private throwMetaOnlyGone(feature: string): never {
    throw new GoneException({
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      feature,
      message: 'WhatsApp agora conecta somente pela API oficial da Meta.',
      use: '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
    });
  }

  /** Link session. */
  @InternalEndpoint('whatsapp session link')
  @Post('session/link')
  linkSession() {
    return this.throwMetaOnlyGone('legacy_session_link');
  }

  /** Claim session. */
  @InternalEndpoint('whatsapp session claim')
  @Post('session/claim')
  claimSession() {
    return this.throwMetaOnlyGone('legacy_session_claim');
  }

  /** Perform session action. */
  @Post('session/action')
  performSessionAction() {
    return this.throwMetaOnlyGone('legacy_session_action');
  }

  /** Takeover. */
  @Post('session/takeover')
  takeover() {
    return this.throwMetaOnlyGone('legacy_session_takeover');
  }

  /** Resume agent. */
  @Post('session/resume-agent')
  resumeAgent() {
    return this.throwMetaOnlyGone('legacy_session_resume_agent');
  }

  /** Pause agent. */
  @InternalEndpoint('whatsapp session pause agent')
  @Post('session/pause-agent')
  pauseAgent() {
    return this.throwMetaOnlyGone('legacy_session_pause_agent');
  }

  /** Reconcile session. */
  @InternalEndpoint('whatsapp session reconcile')
  @Post('session/reconcile')
  reconcileSession() {
    return this.throwMetaOnlyGone('legacy_session_reconcile');
  }

  /** Get session proofs. */
  @InternalEndpoint('whatsapp session proofs')
  @Get('session/proofs')
  getSessionProofs() {
    return this.throwMetaOnlyGone('legacy_session_proofs');
  }

  /** Get session stream token. */
  @InternalEndpoint('whatsapp session stream token')
  @Post('session/stream-token')
  getSessionStreamToken() {
    return this.throwMetaOnlyGone('legacy_session_stream_token');
  }

  /** Get session stream health. */
  @InternalEndpoint('whatsapp session stream health')
  @Get('session/stream-health')
  getSessionStreamHealth() {
    return this.throwMetaOnlyGone('legacy_session_stream_health');
  }

  /** Run session action turn. */
  @InternalEndpoint('whatsapp session action turn')
  @Post('session/action-turn')
  runSessionActionTurn() {
    return this.throwMetaOnlyGone('legacy_session_action_turn');
  }
}
