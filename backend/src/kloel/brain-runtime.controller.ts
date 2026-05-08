import { Body, Controller, Get, Logger, Post, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces';
import { BrainAutonomyService } from './brain-autonomy.service';
import { BrainDecideDto, BrainObserveDto } from './brain-runtime.dto';
import { BrainCommercialGraphService } from './brain-commercial-graph.service';
import { BrainRuntimeService } from './brain-runtime.service';

function escapeHtmlUnsafeJsonChars(json: string): string {
  let escaped = '';
  for (const char of json) {
    if (char === '<') {
      escaped += '\\u003c';
    } else if (char === '>') {
      escaped += '\\u003e';
    } else if (char === '&') {
      escaped += '\\u0026';
    } else {
      escaped += char;
    }
  }
  return escaped;
}

function readOptionalStreamString(body: BrainDecideDto, key: string): string | undefined {
  const value = body.context?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

@Controller('brain')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class BrainRuntimeController {
  private readonly logger = new Logger(BrainRuntimeController.name);

  constructor(
    private readonly brain: BrainRuntimeService,
    private readonly graph: BrainCommercialGraphService,
    private readonly autonomy: BrainAutonomyService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return this.brain.listCapabilities();
  }

  @Get('events/taxonomy')
  eventTaxonomy() {
    return this.brain.eventTaxonomy();
  }

  @Get('graph/commercial')
  commercialGraph(@Request() req: AuthenticatedRequest) {
    return this.graph.buildWorkspaceGraph(req.workspaceId || req.user.workspaceId);
  }

  @Get('graph/recommendations')
  graphRecommendations(@Request() req: AuthenticatedRequest) {
    return this.graph.recommendNextActions(req.workspaceId || req.user.workspaceId);
  }

  @Get('autonomy/proposals')
  autonomyProposals(@Request() req: AuthenticatedRequest) {
    return this.autonomy.propose(req.workspaceId || req.user.workspaceId);
  }

  @Post('decide')
  decide(@Body() body: BrainDecideDto, @Request() req: AuthenticatedRequest) {
    return this.brain.decide({
      body,
      workspaceId: req.workspaceId || req.user.workspaceId,
      userId: req.user.sub,
    });
  }

  @Post('observe')
  observe(@Body() body: BrainObserveDto, @Request() req: AuthenticatedRequest) {
    return this.brain.observe({
      body,
      workspaceId: req.workspaceId || req.user.workspaceId,
      userId: req.user.sub,
    });
  }

  @Post('stream')
  async stream(
    @Body() body: BrainDecideDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const startedAt = Date.now();
    const workspaceId = req.workspaceId || req.user.workspaceId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>): boolean => {
      if (res.writableEnded || res.destroyed) {
        return false;
      }
      try {
        res.write(`data: ${escapeHtmlUnsafeJsonChars(JSON.stringify(payload))}\n\n`);
        return true;
      } catch {
        return false;
      }
    };

    try {
      const events = await this.brain.streamDecisionEvents({
        body,
        workspaceId,
        userId: req.user.sub,
      });
      for (const event of events) {
        if (!writeEvent(event)) {
          break;
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        {
          durationMs: Date.now() - startedAt,
          errorCode: error instanceof Error ? error.name : 'UnknownError',
          externalId: readOptionalStreamString(body, 'externalId'),
          operation: 'brain_stream',
          provider: readOptionalStreamString(body, 'provider'),
          status: 'failure',
          userId: req.user.sub,
          workspaceId,
        },
        error instanceof Error ? error.stack : undefined,
      );
      writeEvent({
        type: 'error',
        error: 'Nao consegui concluir esta resposta agora.',
        done: true,
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
