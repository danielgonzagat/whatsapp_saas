import { Worker, Job } from 'bullmq';
import { flowQueue } from '../queue/queue';
import {
  createRedisClient,
  getRedisUrl,
  maskRedisUrl,
} from '../common/redis/redis.util';

console.log('[WORKER] MassSend Worker módulo carregado.');

const MASS_SEND_JITTER_MIN_MS = Math.max(
  0,
  parseInt(process.env.MASS_SEND_JITTER_MIN_MS || '5000', 10) || 5000,
);
const MASS_SEND_JITTER_MAX_MS = Math.max(
  MASS_SEND_JITTER_MIN_MS,
  parseInt(process.env.MASS_SEND_JITTER_MAX_MS || '15000', 10) || 15000,
);

function nextDispatchDelay(cumulativeDelay: number): number {
  const spread = MASS_SEND_JITTER_MAX_MS - MASS_SEND_JITTER_MIN_MS;
  const jitter =
    MASS_SEND_JITTER_MIN_MS +
    (spread > 0 ? Math.floor(Math.random() * (spread + 1)) : 0);
  return cumulativeDelay + jitter;
}

/**
 * Worker responsável por processar campanhas de disparo em massa.
 * Enfileira mensagens individuais na fila principal (send-message) para
 * aproveitar anti-ban, rate-limit e métricas do worker dedicado.
 */

// Lazy initialization - conexão só é criada quando o worker é iniciado
let _worker: Worker | null = null;

export function startMassSendWorker() {
  if (_worker) return _worker;

  const redisUrl = getRedisUrl();
  console.log('[WORKER] Iniciando MassSend Worker...');
  console.log('[WORKER] REDIS_URL detectada:', maskRedisUrl(redisUrl));

  const connection = createRedisClient();

  _worker = new Worker(
    'mass-send',
    async (job: Job) => {
      const { user, numbers = [], message, workspaceId } = job.data || {};

      console.log(
        `[WORKER] Iniciando campanha workspace=${workspaceId} para user=${user}. Total: ${numbers.length} números.`,
      );

      if (!workspaceId) {
        console.error('[WORKER] workspaceId ausente, abortando campanha');
        return;
      }

      if (!Array.isArray(numbers) || numbers.length === 0) {
        console.warn('[WORKER] Nenhum número para processar');
        return;
      }

      let cumulativeDelay = 0;

      for (const number of numbers) {
        const sanitized = (number || '').replace(/\D/g, '');
        if (!sanitized) continue;
        try {
          cumulativeDelay = nextDispatchDelay(cumulativeDelay);

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
              removeOnComplete: true,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              delay: cumulativeDelay,
            },
          );
        } catch (err: any) {
          console.error(`[WORKER] Erro ao enfileirar ${number}:`, err.message);
        }
      }

      console.log(
        `[WORKER] Campanha finalizada (jobs enfileirados com atraso acumulado de ${cumulativeDelay}ms).`,
      );
    },
    { connection, lockDuration: 60000 },
  );

  (global as any).massSendWorker = _worker;
  return _worker;
}

// Auto-start se este arquivo for importado como módulo
// mas NÃO executa no import time - apenas exporta a função
export default { startMassSendWorker };
