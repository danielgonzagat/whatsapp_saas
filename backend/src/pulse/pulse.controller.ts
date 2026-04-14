import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';
import { PulseService } from './pulse.service';

@ApiTags('Pulse')
@Controller('pulse')
export class PulseController {
  constructor(private readonly pulse: PulseService) {}

  @Post('live/heartbeat')
  @ApiOperation({ summary: 'Authenticated product-surface heartbeat for the live organism graph' })
  async heartbeat(
    @CurrentUser() user: JwtPayload,
    @Body() body: PulseFrontendHeartbeatDto,
  ): Promise<Record<string, unknown>> {
    return this.pulse.recordFrontendHeartbeat(user, body);
  }

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

  @Public()
  @Get('live/state')
  @ApiOperation({ summary: 'Aggregated live organism state built from continuous heartbeats' })
  async state(@Req() req: Request): Promise<Record<string, unknown>> {
    this.assertInternalAccess(req);
    return this.pulse.getOrganismState();
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

    if (provided !== expected) {
      throw new UnauthorizedException('Invalid internal access token');
    }
  }
}
