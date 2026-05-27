import { Body, Controller, Get, Post, Request, Res, UseFilters, UseGuards } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { Response } from 'express';
import { BrainDecideDegradeFilter } from './brain-decide-degrade.filter';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces';
import { Metrics } from '../observability/metrics';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { MindAutonomyCoordinator, MindCommercialGraph, MindRuntime } from './mind/coordination';
import { BrainDecideDto, BrainObserveDto } from './brain-runtime.dto';

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
@UseFilters(BrainDecideDegradeFilter)
export class BrainRuntimeController {
  private readonly logger = StructuredLogger.from(BrainRuntimeController.name);

  constructor(
    private readonly brain: MindRuntime,
    private readonly graph: MindCommercialGraph,
    private readonly autonomy: MindAutonomyCoordinator,
  ) {}

  @InternalEndpoint('brain capabilities endpoint')
  @Get('capabilities')
  capabilities() {
    return this.brain.listCapabilities();
  }

  @InternalEndpoint('brain event taxonomy')
  @Get('events/taxonomy')
  eventTaxonomy() {
    return this.brain.eventTaxonomy();
  }

  @InternalEndpoint('brain commercial graph')
  @Get('graph/commercial')
  commercialGraph(@Request() req: AuthenticatedRequest) {
    return this.graph.buildWorkspaceGraph(req.workspaceId || req.user.workspaceId);
  }

  @InternalEndpoint('brain recommendations')
  @Get('graph/recommendations')
  graphRecommendations(@Request() req: AuthenticatedRequest) {
    return this.graph.recommendNextActions(req.workspaceId || req.user.workspaceId);
  }

  @InternalEndpoint('brain autonomy proposals')
  @Get('autonomy/proposals')
  autonomyProposals(@Request() req: AuthenticatedRequest) {
    return this.autonomy.propose(req.workspaceId || req.user.workspaceId);
  }

  @InternalEndpoint('brain decision endpoint')
  @Post('decide')
  async decide(@Body() body: BrainDecideDto, @Request() req: AuthenticatedRequest) {
    const start = Date.now();
    const workspaceId = req.workspaceId || req.user.workspaceId;
    try {
      const result = await this.brain.decide({
        body,
        workspaceId,
        userId: req.user.sub,
      });
      Metrics.endpoint.success('brain.decide', { workspaceId });
      Metrics.endpoint.duration('brain.decide', Date.now() - start, { workspaceId });
      return result;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('brain.decide', { workspaceId, code });
      // Honest degraded state instead of a bare 4xx/5xx that kills the chat
      // for the authenticated user. The real error is logged server-side for
      // root-cause; the user-facing chat must never hard-fail (CLAUDE.md:
      // fallback honesto / estado honesto). Contract-shape preserved.
      this.logger.error(
        `brain.decide failed (code=${code}): ${err instanceof Error ? err.message : String(err)}`,
      );
      const degradedSource = body.source ?? 'chat';
      const degradedIntent = body.intent ?? 'user_message';
      const degradedRequestId =
        typeof body.context?.clientRequestId === 'string'
          ? body.context.clientRequestId
          : `brain_degraded_${Date.now()}`;
      return {
        actions: [],
        confidence: 0,
        intent: degradedIntent,
        requestId: degradedRequestId,
        source: degradedSource,
        response:
          'O Kloel teve uma instabilidade momentânea e não conseguiu concluir esta ação. Sua mensagem foi preservada — tente novamente em instantes.',
      };
    }
  }

  @InternalEndpoint('brain observation endpoint')
  @Post('observe')
  async observe(@Body() body: BrainObserveDto, @Request() req: AuthenticatedRequest) {
    const start = Date.now();
    const workspaceId = req.workspaceId || req.user.workspaceId;
    try {
      const result = await this.brain.observe({
        body,
        workspaceId,
        userId: req.user.sub,
      });
      Metrics.endpoint.success('brain.observe', { workspaceId });
      Metrics.endpoint.duration('brain.observe', Date.now() - start, { workspaceId });
      return result;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('brain.observe', { workspaceId, code });
      throw err;
    }
  }

  @InternalEndpoint('brain stream endpoint')
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
      Metrics.endpoint.success('brain.stream', { workspaceId });
      Metrics.endpoint.duration('brain.stream', Date.now() - startedAt, { workspaceId });
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code ?? 'unknown';
      Metrics.endpoint.failure('brain.stream', { workspaceId, code });
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
