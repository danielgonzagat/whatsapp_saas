import Redis from "ioredis";
import { resolveRedisUrl, maskRedisUrl } from "./resolve-redis";

// ========================================
// RESOLUÇÃO DA URL (aceita PUBLIC_URL ou host/port)
// ========================================
console.log('========================================');
console.log('🔍 [WORKER/REDIS-CLIENT] Resolvendo URL do Redis...');

let redisUrl: string;
try {
  redisUrl = resolveRedisUrl();
} catch (err: any) {
  console.error('❌ [WORKER] Não foi possível resolver a URL do Redis:', err.message);
  process.exit(1);
}

// Validar que não é interno
if (redisUrl.includes('.railway.internal')) {
  console.error('❌ [WORKER] URL do Redis ainda contém .railway.internal!');
  console.error('📋 Configure REDIS_PUBLIC_URL com a URL pública.');
  process.exit(1);
}

// Máscara nos logs
const maskedUrl = maskRedisUrl(redisUrl);
console.log('✅ [WORKER] Usando Redis:', maskedUrl);
console.log('========================================');

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
};

// Cliente para comandos gerais
export const redis = new Redis(redisUrl, redisOptions);

redis.on('error', (err) => {
  console.error('❌ [WORKER/redis] Redis error:', err.message);
});

redis.on('ready', () => {
  console.log('✅ [WORKER/redis] Redis pronto');
});

// Cliente para Pub/Sub (Subscriber precisa de conexão exclusiva)
export const redisSub = new Redis(redisUrl, redisOptions);

redisSub.on('error', (err) => {
  console.error('❌ [WORKER/redisSub] Redis error:', err.message);
});

// Cliente para Pub/Sub (Publisher)
export const redisPub = new Redis(redisUrl, redisOptions);

redisPub.on('error', (err) => {
  console.error('❌ [WORKER/redisPub] Redis error:', err.message);
});
