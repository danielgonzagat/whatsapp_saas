import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BETA_PRIOR_ALPHA = 1;
const BETA_PRIOR_BETA = 1;

export interface KloelGlobalPriorResult {
  mean: number;
  observations: number;
}

@Injectable()
export class KloelGlobalPriorService {
  private readonly logger = new Logger(KloelGlobalPriorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPrior(
    channel: string,
    decisionType: string,
    action: string,
  ): Promise<KloelGlobalPriorResult | null> {
    const startedAt = Date.now();
    const row = await this.prisma.kloelGlobalPrior.findUnique({
      where: { channel_decisionType_action: { channel, decisionType, action } },
      select: { observations: true, successes: true },
    });

    if (!row) {
      this.logger.debug({
        operation: 'kloel_global_prior.get_prior',
        status: 'not_found',
        durationMs: Date.now() - startedAt,
        channel,
        decisionType,
        action,
      });
      return null;
    }

    const alpha = BETA_PRIOR_ALPHA + row.successes;
    const beta = BETA_PRIOR_BETA + (row.observations - row.successes);
    const mean = alpha / (alpha + beta);

    this.logger.debug({
      operation: 'kloel_global_prior.get_prior',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      channel,
      decisionType,
      action,
      observations: row.observations,
      successes: row.successes,
      mean,
    });

    return { mean, observations: row.observations };
  }

  async recordObservation(
    channel: string,
    decisionType: string,
    action: string,
    success: boolean,
  ): Promise<void> {
    const startedAt = Date.now();

    const updateData: {
      observations: { increment: number };
      successes?: { increment: number };
    } = {
      observations: { increment: 1 },
    };
    if (success) {
      updateData.successes = { increment: 1 };
    }

    await this.prisma.kloelGlobalPrior.upsert({
      where: { channel_decisionType_action: { channel, decisionType, action } },
      create: {
        channel,
        decisionType,
        action,
        observations: 1,
        successes: success ? 1 : 0,
      },
      update: updateData,
    });

    this.logger.debug({
      operation: 'kloel_global_prior.record_observation',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      channel,
      decisionType,
      action,
      success,
    });
  }
}
