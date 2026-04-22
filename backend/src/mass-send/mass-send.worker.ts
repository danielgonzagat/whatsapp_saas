import { randomInt } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient, getRedisUrl, maskRedisUrl } from '../common/redis/redis.util';
import { flowQueue } from '../queue/queue';

const D_RE = /\D/g;

const logger = new Logger('MassSendWorker');

logger.log('MassSend Worker módulo carregado.');

const MASS_SEND_JITTER_MIN_MS = Math.max(
  0,
  Number.parseInt(process.env.MASS_SEND_JITTER_MIN_MS || '5000', 10) || 5000,
);
const MASS_SEND_JITTER_MAX_MS = Math.max(
  MASS_SEND_JITTER_MIN_MS,
  Number.parseInt(process.env.MASS_SEND_JITTER_MAX_MS || '15000', 10) || 15000,
);

function nextDispatchDelay(cumulativeDelay: number): number {
  const spread = MASS_SEND_JITTER_MAX_MS - MASS_SEND_JITTER_MIN_MS;
  const jitter = MASS_SEND_JITTER_MIN_MS + (spread > 0 ? randomInt(spread + 1) : 0);
  return cumulativeDelay + jitter;
}

/**
 * Worker responsável por processar campanhas de disparo em massa.
 * Enfileira mensagens individuais na fila principal (send-message) para
 * aproveitar anti-ban, rate-limit e métricas do worker dedicado.
 * messageLimit: enforced via PlanLimitsService.trackMessageSend at send time
 */

// Lazy initialization - conexão só é criada quando o worker é iniciado
let _worker: Worker | null = null;

/** Start mass send worker. */
export function startMassSendWorker() {
  if (_worker) {
    return _worker;
  }

  const redisUrl = getRedisUrl();
  logger.log('Iniciando MassSend Worker...');
  logger.log(`REDIS_URL detectada: ${maskRedisUrl(redisUrl)}`);

  const connection = createRedisClient();

  _worker = new Worker(
    'mass-send',
    async (job: Job) => {
      const { user, numbers = [], message, workspaceId } = job.data || {};

      logger.log(
        `Iniciando campanha workspace=${workspaceId} para user=${user}. Total: ${numbers.length} números.`,
      );

      if (!workspaceId) {
        logger.error('workspaceId ausente, abortando campanha');
        return;
      }

      if (!Array.isArray(numbers) || numbers.length === 0) {
        logger.warn('Nenhum número para processar');
        return;
      }

      let cumulativeDelay = 0;

      await forEachSequential(numbers, async (number) => {
        const sanitized = (number || '').replace(D_RE, '');
        if (!sanitized) {
          return;
        }
        try {
          cumulativeDelay = nextDispatchDelay(cumulativeDelay);

          // Deduplicate via jobId: same campaign + number = same job
          const jobId = `mass-send:${job.id}:${sanitized}`;
          await flowQueue.add(
            'send-message',
            {
              workspaceId,
              workspace: null, // worker principal pode resolver provider via contato
              to: sanitized,
              message,
              user: sanitized,
            },
            {
              jobId,
              removeOnComplete: true,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              delay: cumulativeDelay,
            },
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'unknown_error';
          logger.error(`Erro ao enfileirar ${number}: ${errorMessage}`);
        }
      });

      logger.log(
        `Campanha finalizada (jobs enfileirados com atraso acumulado de ${cumulativeDelay}ms).`,
      );
    },
    { connection, lockDuration: 60000 },
  );

  Reflect.set(globalThis, 'massSendWorker', _worker);
  return _worker;
}

// Auto-start se este arquivo for importado como módulo
// mas NÃO executa no import time - apenas exporta a função
export default { startMassSendWorker };
