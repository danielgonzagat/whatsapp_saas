import Redis from "ioredis";

// ========================================
// CONSTRUIR REDIS_URL SE NECESSÁRIO
// ========================================
function buildRedisUrlFromComponents(): string | undefined {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME ?? process.env.REDIS_USER;
  
  if (!host) return undefined;
  
  const auth = username && password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : password
      ? `${encodeURIComponent(password)}@`
      : '';
  
  return `redis://${auth}${host}:${port}`;
}

console.log('========================================');
console.log('🔍 [WORKER/REDIS-CLIENT] Verificando configuração Redis...');

let redisUrl: string | undefined = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn('⚠️  [WORKER] REDIS_URL não definida, tentando REDIS_HOST/PORT...');
  redisUrl = buildRedisUrlFromComponents();
  
  if (redisUrl) {
    const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
    console.warn('⚠️  [WORKER] URL construída de REDIS_HOST/PORT:', maskedUrl);
  } else {
    console.error('❌ [WORKER] REDIS_URL e REDIS_HOST não definidas!');
    console.error('📋 Configure REDIS_URL ou REDIS_HOST/REDIS_PORT');
    process.exit(1);
  }
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
