import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('❌ [WORKER] REDIS_URL não está definida!');
  process.exit(1);
}

if (redisUrl.includes('.railway.internal')) {
  console.error('❌ [WORKER] REDIS_URL está usando hostname interno!');
  console.error('❌ [WORKER] Use a URL PÚBLICA do Redis.');
  process.exit(1);
}

console.log('✅ [WORKER] Redis URL:', redisUrl.replace(/:[^:@]+@/, ':***@'));

// Cliente para comandos gerais
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Cliente para Pub/Sub (Subscriber precisa de conexão exclusiva)
export const redisSub = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Cliente para Pub/Sub (Publisher)
export const redisPub = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
