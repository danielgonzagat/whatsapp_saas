import Redis from "ioredis";
import { resolveRedisUrl, maskRedisUrl } from "./resolve-redis";

// ========================================
// RESOLUÇÃO DA URL (aceita PUBLIC_URL, REDIS_URL ou host/port)
// ========================================
console.log('========================================');
console.log('🔍 [WORKER/REDIS-CLIENT] Resolvendo URL do Redis...');

let redisUrl: string = '';
let redisConfigured = false;

try {
  redisUrl = resolveRedisUrl();
  redisConfigured = !!redisUrl && redisUrl.length > 0;
} catch (err: any) {
  console.error('');
  console.error('⚠️ ============================================');
  console.error('⚠️ [WORKER] AVISO: Redis NÃO configurado');
  console.error('⚠️ ============================================');
  console.error('');
  console.error('📋 Erro:', err.message);
  console.error('');
  console.error('O worker continuará, mas funcionalidades Redis estarão desativadas.');
  console.error('Configure REDIS_URL ou REDIS_PUBLIC_URL para habilitar o processamento de jobs.');
  console.error('');
  redisConfigured = false;
}

// Aviso se for host interno (mas não bloqueia)
if (redisConfigured && redisUrl.includes('.railway.internal')) {
  console.warn('⚠️  [WORKER] URL do Redis é um host interno do Railway.');
  console.warn('⚠️  Certifique-se de que o worker está na mesma rede do Redis.');
}

// Máscara nos logs
const maskedUrl = redisConfigured ? maskRedisUrl(redisUrl) : '(não configurado)';
console.log(redisConfigured ? '✅ [WORKER] Usando Redis:' : '⚠️  [WORKER] Redis:', maskedUrl);
console.log('========================================');

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
};

/**
 * Cria um cliente Redis mock para quando Redis não está configurado.
 * Evita erros de runtime mas não processa nada.
 */
function createMockRedis(): Redis {
  const mock = {
    on: () => mock,
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    quit: () => Promise.resolve(),
    get: (key: string) => {
      console.warn(`[MockRedis] get("${key}") returned null — Redis not connected`);
      return Promise.resolve(null);
    },
    set: (key: string, _value: string) => {
      console.warn(`[MockRedis] set("${key}") dropped — Redis not connected`);
      return Promise.resolve('OK');
    },
    del: (key: string) => {
      console.warn(`[MockRedis] del("${key}") dropped — Redis not connected`);
      return Promise.resolve(0);
    },
    publish: (channel: string, _message: string) => {
      console.warn(`[MockRedis] publish to ${channel} dropped — Redis not connected`);
      return Promise.resolve(0);
    },
    subscribe: (channel: string) => {
      console.warn(`[MockRedis] subscribe to ${channel} dropped — Redis not connected`);
      return Promise.resolve();
    },
    unsubscribe: (channel: string) => {
      console.warn(`[MockRedis] unsubscribe from ${channel} dropped — Redis not connected`);
      return Promise.resolve();
    },
  } as any;
  return mock;
}

// Cliente para comandos gerais
export const redis = redisConfigured 
  ? new Redis(redisUrl, redisOptions)
  : createMockRedis();

if (redisConfigured) {
  redis.on('error', (err) => {
    console.error('❌ [WORKER/redis] Redis error:', err.message);
  });

  redis.on('ready', () => {
    console.log('✅ [WORKER/redis] Redis pronto');
  });
}

// Cliente para Pub/Sub (Subscriber precisa de conexão exclusiva)
export const redisSub = redisConfigured 
  ? new Redis(redisUrl, redisOptions)
  : createMockRedis();

if (redisConfigured) {
  redisSub.on('error', (err) => {
    console.error('❌ [WORKER/redisSub] Redis error:', err.message);
  });
}

// Cliente para Pub/Sub (Publisher)
export const redisPub = redisConfigured 
  ? new Redis(redisUrl, redisOptions)
  : createMockRedis();

if (redisConfigured) {
  redisPub.on('error', (err) => {
    console.error('❌ [WORKER/redisPub] Redis error:', err.message);
  });
}

// Exporta flag para verificação em outros módulos
export const isRedisConfigured = redisConfigured;
