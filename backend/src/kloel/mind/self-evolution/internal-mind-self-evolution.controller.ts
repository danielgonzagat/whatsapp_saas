import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../../../auth/public.decorator';
import { InternalEndpoint } from '../../../common/decorators/internal-endpoint.decorator';
import { StructuredLogger } from '../../../logging/structured-logger';
import { PrismaService } from '../../../prisma/prisma.service';
import { RouteClass } from '../../../common/throttler/route-class.decorator';
import { MindSelfModificationService } from './mind-self-modification.service';

/**
 * InternalMindSelfEvolutionController — cron entry point for the platform-wide
 * Self-Evolution loop.
 *
 * The Worker BullMQ scheduler hits POST `/internal/mind-self-evolution/trigger`
 * every 6h. The controller fans out across every workspace, asks
 * {@link MindSelfModificationService.runEvolutionCycle} to (1) build a proposal,
 * (2) persist a `cognition.self_modification.proposed` row in
 * `RAC_MindOutboxEvent`, and (3) emit the proposal envelope on the spine.
 *
 * Mind is invisible — there is NO frontend surface for this controller. It is
 * gated by the same `INTERNAL_API_KEY` shared-secret pattern as the existing
 * worker → backend internal handshakes (see InternalWhatsAppRuntimeController).
 *
 * Failure isolation: a single workspace that throws is logged + counted as a
 * `failed` row in the summary, but never aborts the sweep.
 */
@Controller('internal/mind-self-evolution')
@RouteClass('mutate')
export class InternalMindSelfEvolutionController {
  private readonly logger = StructuredLogger.from(InternalMindSelfEvolutionController.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly selfModification: MindSelfModificationService,
  ) {}

  @InternalEndpoint('worker mind self-evolution cron trigger')
  @Post('trigger')
  @Public()
  async trigger(
    @Body() body: { workspaceLimit?: number; workspaceIds?: string[] } | undefined,
    @Headers('x-internal-key') internalKey?: string,
  ): Promise<{
    ok: boolean;
    sweptWorkspaces: number;
    persisted: number;
    failed: number;
    sample: Array<{ workspaceId: string; eventId: string | null; opportunities: number }>;
  }> {
    this.assertInternalKey(internalKey);

    const sweptIds = await this.resolveTargetWorkspaceIds(body);
    let persisted = 0;
    let failed = 0;
    const sample: Array<{ workspaceId: string; eventId: string | null; opportunities: number }> =
      [];

    for (const workspaceId of sweptIds) {
      try {
        const result = await this.selfModification.runEvolutionCycle(workspaceId);
        if (result.persisted) {
          persisted += 1;
        } else {
          failed += 1;
        }
        if (sample.length < 5) {
          sample.push({
            workspaceId,
            eventId: result.eventId,
            opportunities: result.proposal.opportunities.length,
          });
        }
      } catch (error: unknown) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`self_evolution_workspace_failed workspace=${workspaceId}: ${message}`);
      }
    }

    this.logger.log(
      `self_evolution_sweep_completed swept=${sweptIds.length} persisted=${persisted} failed=${failed}`,
    );

    return { ok: true, sweptWorkspaces: sweptIds.length, persisted, failed, sample };
  }

  private async resolveTargetWorkspaceIds(
    body: { workspaceLimit?: number; workspaceIds?: string[] } | undefined,
  ): Promise<string[]> {
    if (body?.workspaceIds && body.workspaceIds.length > 0) {
      return body.workspaceIds.slice(0, MAX_WORKSPACE_SWEEP);
    }
    const limit = Math.min(
      Math.max(body?.workspaceLimit ?? DEFAULT_WORKSPACE_LIMIT, 1),
      MAX_WORKSPACE_SWEEP,
    );
    const rows = await this.prisma.workspace.findMany({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  private assertInternalKey(internalKey?: string): void {
    const expectedInternalKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
    if (!expectedInternalKey) {
      throw new UnauthorizedException('INTERNAL_API_KEY not configured');
    }
    if (internalKey !== expectedInternalKey) {
      throw new ForbiddenException('Invalid internal key');
    }
  }
}

/**
 * Default per-sweep workspace cap. Keeps a single cron tick bounded so a
 * pathological backend response time on one workspace cannot stall the cycle
 * for the rest of the platform.
 */
const DEFAULT_WORKSPACE_LIMIT = 500;

/**
 * Hard upper bound — even an explicit caller cannot ask for more than 5_000
 * workspaces in a single tick. Beyond this the cron should be sharded.
 */
const MAX_WORKSPACE_SWEEP = 5_000;
