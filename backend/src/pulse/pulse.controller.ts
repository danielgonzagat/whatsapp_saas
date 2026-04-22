import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { safeCompareStrings } from '../common/utils/crypto-compare.util';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';
import { PulseService } from './pulse.service';

/** Pulse controller. */
@ApiTags('Pulse')
@Controller('pulse')
export class PulseController {
  constructor(private readonly pulse: PulseService) {}

  /** Heartbeat. */
  @Post('live/heartbeat')
  @ApiOperation({ summary: 'Authenticated product-surface heartbeat for the live organism graph' })
  async heartbeat(
    @CurrentUser() user: JwtPayload,
    @Body() body: PulseFrontendHeartbeatDto,
  ): Promise<Record<string, unknown>> {
    return this.pulse.recordFrontendHeartbeat(user, body);
  }

  /** Internal heartbeat. */
  @Public()
  @Post('live/internal')
  @ApiOperation({ summary: 'Internal runtime heartbeat for worker/backend nodes' })
  async internalHeartbeat(
    @Req() req: Request,
    @Body() body: PulseInternalHeartbeatDto,
  ): Promise<Record<string, unknown>> {
    this.assertInternalAccess(req);
    return this.pulse.recordInternalHeartbeat(body);
  }

  /** State. */
  @Public()
  @Get('live/state')
  @ApiOperation({ summary: 'Aggregated live organism state built from continuous heartbeats' })
  async state(@Req() req: Request): Promise<Record<string, unknown>> {
    this.assertInternalAccess(req);
    return this.pulse.getOrganismState();
  }

  /** Snapshot. */
  @Public()
  @Get('live/snapshot')
  @ApiOperation({ summary: 'Canonical production snapshot built from the latest PULSE artifacts' })
  snapshot(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getProductionSnapshot();
  }

  /** Directive. */
  @Public()
  @Get('live/directive')
  @ApiOperation({
    summary: 'Latest canonical PULSE CLI directive artifact for production consumers',
  })
  directive(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestDirective();
  }

  /** Certificate. */
  @Public()
  @Get('live/certificate')
  @ApiOperation({ summary: 'Latest canonical PULSE certificate artifact for production consumers' })
  certificate(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestCertificate();
  }

  /** Vision. */
  @Public()
  @Get('live/vision')
  @ApiOperation({
    summary: 'Latest canonical PULSE product vision artifact for production consumers',
  })
  vision(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestProductVision();
  }

  /** Parity. */
  @Public()
  @Get('live/parity')
  @ApiOperation({
    summary: 'Latest canonical PULSE structural parity gaps artifact for production consumers',
  })
  parity(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestParityGaps();
  }

  /** Scope. */
  @Public()
  @Get('live/scope')
  @ApiOperation({ summary: 'Latest canonical PULSE scope-state artifact for production consumers' })
  scope(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestScopeState();
  }

  /** Codacy. */
  @Public()
  @Get('live/codacy')
  @ApiOperation({
    summary: 'Latest canonical PULSE Codacy-evidence artifact for production consumers',
  })
  codacy(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestCodacyEvidence();
  }

  /** Capabilities. */
  @Public()
  @Get('live/capabilities')
  @ApiOperation({
    summary: 'Latest canonical PULSE capability-state artifact for production consumers',
  })
  capabilities(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestCapabilityState();
  }

  /** Flows. */
  @Public()
  @Get('live/flows')
  @ApiOperation({
    summary: 'Latest canonical PULSE flow-projection artifact for production consumers',
  })
  flows(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestFlowProjection();
  }

  /** Convergence. */
  @Public()
  @Get('live/convergence')
  @ApiOperation({
    summary: 'Latest canonical PULSE convergence-plan artifact for production consumers',
  })
  convergence(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestConvergencePlan();
  }

  /** External signals. */
  @Public()
  @Get('live/external-signals')
  @ApiOperation({
    summary: 'Latest canonical PULSE external-signal artifact for production consumers',
  })
  externalSignals(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestExternalSignalState();
  }

  /** Autonomy state. */
  @Public()
  @Get('live/autonomy')
  @ApiOperation({
    summary: 'Latest canonical PULSE autonomy-state artifact for production consumers',
  })
  autonomy(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestAutonomyState();
  }

  /** Agent orchestration state. */
  @Public()
  @Get('live/orchestration')
  @ApiOperation({
    summary: 'Latest canonical PULSE agent-orchestration-state artifact for production consumers',
  })
  orchestration(@Req() req: Request): unknown {
    this.assertInternalAccess(req);
    return this.pulse.getLatestAgentOrchestrationState();
  }

  private assertInternalAccess(req: Request) {
    const expected =
      process.env.PULSE_RUNTIME_TOKEN ||
      process.env.INTERNAL_API_KEY ||
      process.env.METRICS_TOKEN ||
      process.env.WORKER_METRICS_TOKEN ||
      '';

    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('PULSE runtime internal access is not configured');
      }
      return;
    }

    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const provided =
      String(req.headers['x-internal-key'] || '') ||
      String(req.headers['x-metrics-token'] || '') ||
      bearer;

    if (!provided || !safeCompareStrings(provided, expected)) {
      throw new UnauthorizedException('Invalid internal access token');
    }
  }
}
