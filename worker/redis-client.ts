import Redis from "ioredis";

// ========================================
// VALIDAÇÃO DE REDIS_URL (OBRIGATÓRIA)
// ========================================
const redisUrl = process.env.REDIS_URL;

console.log('========================================');
console.log('🔍 [WORKER/REDIS-CLIENT] Verificando REDIS_URL...');

if (!redisUrl) {
  console.error('❌ [WORKER] REDIS_URL não está definida!');
  console.error('📋 Defina REDIS_URL no ambiente:');
  console.error('   REDIS_URL=redis://user:pass@host:port');
  process.exit(1);
}

if (redisUrl.includes('.railway.internal')) {
  console.error('❌ [WORKER] REDIS_URL está usando hostname interno (.railway.internal)!');
  console.error('📋 Use a URL PÚBLICA do Redis.');
  process.exit(1);
}

if (redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
  console.warn('⚠️  [WORKER] AVISO: REDIS_URL aponta para localhost!');
  console.warn('⚠️  Em containers/produção isso não funciona.');
}

// Mask password for logging
const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
console.log('✅ [WORKER] Redis URL:', maskedUrl);
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
