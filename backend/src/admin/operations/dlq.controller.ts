import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { AdminAuditService } from '../audit/admin-audit.service';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { forEachSequential } from '../../common/async-sequence';
import { getDlqQueue, queueRegistry } from '../../queue/queue';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { PaginationLimitPipe, clampLimit } from '../../common/pagination-clamp.pipe';

@Public()
@Controller('admin/operations/dlq')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('read')
export class DlqController {
  private readonly logger = new Logger(DlqController.name);

  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.VIEW)
  listQueues() {
    const queues = Object.keys(queueRegistry).map((name) => ({ name, dlqName: `${name}-dlq` }));
    return { queues, count: queues.length };
  }

  @Get(':name')
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.VIEW)
  async listDlq(
    @Param('name') name: string,
    @Query('limit', new PaginationLimitPipe({ max: 200 })) limit: number,
    @Query('offset') offset = '0',
  ) {
    const clampedOffset = Math.max(Number(offset) || 0, 0);
    const dlq = this.getDlq(name);

    const [jobs, counts] = await Promise.all([
      dlq.getJobs(
        ['waiting', 'failed', 'delayed', 'active'],
        clampedOffset,
        clampedOffset + limit - 1,
      ),
      dlq.getJobCounts('waiting', 'failed', 'delayed', 'active'),
    ]);

    return {
      queue: name,
      dlqName: `${name}-dlq`,
      counts: {
        waiting: counts.waiting ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        active: counts.active ?? 0,
        total:
          (counts.waiting ?? 0) +
          (counts.failed ?? 0) +
          (counts.delayed ?? 0) +
          (counts.active ?? 0),
      },
      offset: clampedOffset,
      limit,
      jobs: jobs.map((job) => this.serializeJob(job)),
    };
  }

  @Get(':name/inspect/:jobId')
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.VIEW)
  async inspectJob(@Param('name') name: string, @Param('jobId') jobId: string) {
    const dlq = this.getDlq(name);
    const job = await dlq.getJob(jobId);
    if (!job) {
      throw new BadRequestException(`DLQ job ${jobId} not found in queue ${name}`);
    }
    return this.serializeJob(job);
  }

  @Post(':name/reprocess')
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.EDIT)
  async reprocessJobs(
    @Param('name') name: string,
    @Body('jobIds') jobIds?: string[],
    @Body('limit') limit?: number,
    @CurrentAdmin() admin?: AuthenticatedAdmin,
  ) {
    const main = this.getQueue(name);
    const dlq = this.getDlq(name);

    let jobsToReprocess: Awaited<ReturnType<Queue['getJob']>>[] = [];

    if (jobIds && jobIds.length > 0) {
      if (jobIds.length > 100) {
        throw new BadRequestException('Maximum 100 jobIds per request');
      }
      const results = await Promise.all(jobIds.map((id) => dlq.getJob(id)));
      jobsToReprocess = results.filter((j): j is NonNullable<typeof j> => j !== null);
    } else {
      const clampedLimit = clampLimit(limit, { default: 10 });
      jobsToReprocess = await dlq.getJobs(['waiting', 'failed'], 0, clampedLimit - 1);
      jobsToReprocess = jobsToReprocess.filter((j) => j !== null);
    }

    let reprocessed = 0;
    for (const job of jobsToReprocess) {
      if (!job) {
        continue;
      }
      const retryOpts = { ...job.opts, jobId: `dlq-retry:${job.id || Date.now()}` };
      await main.add(job.name || 'default', job.data, retryOpts);
      await job.remove();
      reprocessed += 1;
    }

    this.logger.log(
      JSON.stringify({
        event: 'dlq.reprocess',
        queue: name,
        reprocessed,
        adminId: admin?.id,
      }),
    );

    await this.audit.append({
      adminUserId: admin?.id ?? null,
      action: 'DLQ_REPROCESS',
      entityType: 'queue',
      entityId: name,
      details: { reprocessed, jobIds: jobIds ?? 'oldest', limit },
    });

    return { queue: name, reprocessed };
  }

  @Post(':name/discard')
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.DELETE)
  async discardJobs(
    @Param('name') name: string,
    @Body('jobIds') jobIds?: string[],
    @CurrentAdmin() admin?: AuthenticatedAdmin,
  ) {
    const dlq = this.getDlq(name);

    if (!jobIds || jobIds.length === 0) {
      throw new BadRequestException('jobIds array is required for discard');
    }

    if (jobIds.length > 100) {
      throw new BadRequestException('Maximum 100 jobIds per request');
    }

    let discarded = 0;
    await forEachSequential(jobIds, async (jobId) => {
      const job = await dlq.getJob(jobId);
      if (job) {
        await job.remove();
        discarded += 1;
      }
    });

    this.logger.log(
      JSON.stringify({
        event: 'dlq.discard',
        queue: name,
        discarded,
        adminId: admin?.id,
      }),
    );

    await this.audit.append({
      adminUserId: admin?.id ?? null,
      action: 'DLQ_DISCARD',
      entityType: 'queue',
      entityId: name,
      details: { discarded, jobIds },
    });

    return { queue: name, discarded };
  }

  @Delete(':name/purge')
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermission(AdminModule.CONFIGURACOES, AdminAction.DELETE)
  async purgeDlq(@Param('name') name: string, @CurrentAdmin() admin?: AuthenticatedAdmin) {
    const dlq = this.getDlq(name);
    const counts = await dlq.getJobCounts('waiting', 'active', 'delayed', 'failed');
    await dlq.drain();
    await dlq.clean(0, 1000, 'failed');

    this.logger.log(
      JSON.stringify({
        event: 'dlq.purge',
        queue: name,
        purgedCounts: counts,
        adminId: admin?.id,
      }),
    );

    await this.audit.append({
      adminUserId: admin?.id ?? null,
      action: 'DLQ_PURGE',
      entityType: 'queue',
      entityId: name,
      details: { purgedCounts: counts },
    });

    return { queue: name, purged: counts };
  }

  private getQueue(name: string): Queue {
    const queue = queueRegistry[name];
    if (!queue) {
      throw new BadRequestException(`Queue not found: ${name}`);
    }
    return queue;
  }

  private getDlq(name: string): Queue {
    const queue = this.getQueue(name);
    return getDlqQueue(queue);
  }

  private serializeJob(
    job: NonNullable<Awaited<ReturnType<Queue['getJob']>>>,
  ): Record<string, unknown> {
    return {
      id: job.id,
      name: job.name,
      data: job.data as Record<string, unknown>,
      opts: job.opts,
      failedReason: job.failedReason,
      attemptsMade: (job as { attemptsMade?: number }).attemptsMade ?? 0,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
}
