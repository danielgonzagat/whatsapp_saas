import { Worker, Job } from 'bullmq';
import { flowQueue } from '../queue/queue';
import {
  createRedisClient,
  getRedisUrl,
  maskRedisUrl,
} from '../common/redis/redis.util';

console.log('[WORKER] MassSend Worker carregado.');

/**
 * Worker responsável por processar campanhas de disparo em massa.
 * Enfileira mensagens individuais na fila principal (send-message) para
 * aproveitar anti-ban, rate-limit e métricas do worker dedicado.
 */
const redisUrl = getRedisUrl();
console.log('[WORKER] REDIS_URL detectada:', maskRedisUrl(redisUrl));

const connection = createRedisClient();

const worker = new Worker(
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

    for (const number of numbers) {
      const sanitized = (number || '').replace(/\D/g, '');
      if (!sanitized) continue;
      try {
        await flowQueue.add(
          'send-message',
          {
            workspaceId,
            workspace: null, // worker principal pode resolver provider via contato
            to: sanitized,
            message,
            user: sanitized,
          },
          { removeOnComplete: true },
        );

        // Pequeno jitter para não saturar fila/Redis
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        console.error(`[WORKER] Erro ao enfileirar ${number}:`, err.message);
      }
    }

    console.log('[WORKER] Campanha finalizada (jobs enfileirados).');
  },
  { connection },
);

(global as any).massSendWorker = worker;

export default worker;
