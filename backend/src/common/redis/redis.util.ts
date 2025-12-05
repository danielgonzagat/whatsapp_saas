import Redis, { RedisOptions } from 'ioredis';

const INTERNAL_HOST_PATTERNS = ['.railway.internal', 'redis.railway.internal'];

/**
 * Constrói a URL do Redis a partir de REDIS_HOST/PORT quando REDIS_URL não está definida
 */
function buildRedisUrlFromComponents(): string | undefined {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME ?? process.env.REDIS_USER;
  
  if (!host) {
    return undefined;
  }
  
  const auth = username && password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : password
      ? `${encodeURIComponent(password)}@`
      : '';
  
  return `redis://${auth}${host}:${port}`;
}

export function getRedisUrl(): string {
  let redisUrl: string | undefined = process.env.REDIS_URL;
  
  console.log('========================================');
  console.log('🔍 [REDIS] Verificando configuração Redis...');
  
  if (!redisUrl) {
    console.warn('⚠️  [REDIS] REDIS_URL não definida, tentando REDIS_HOST/PORT...');
    redisUrl = buildRedisUrlFromComponents();
    
    if (redisUrl) {
      const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
      console.warn('⚠️  [REDIS] URL construída de REDIS_HOST/PORT:', maskedUrl);
    } else {
      console.error('❌ [REDIS] Faltam REDIS_URL e REDIS_HOST; configure uma delas.');
      throw new Error('REDIS_URL or REDIS_HOST environment variable is required');
    }
  }
  
  if (INTERNAL_HOST_PATTERNS.some((marker) => redisUrl.includes(marker))) {
    console.error('❌ [REDIS] Você está usando hostname interno (.railway.internal)');
    console.error('📋 Use a URL PÚBLICA do Redis.');
    throw new Error(
      'REDIS_URL cannot reference the internal Railway hostname. Use the public URL.',
    );
  }
  
  if (redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
    console.warn('⚠️  [REDIS] AVISO: REDIS_URL aponta para localhost!');
    console.warn('⚠️  Em containers/produção isso não funciona.');
  }
  
  // Mask password for logging
  const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
  console.log('✅ [REDIS] URL válida:', maskedUrl);
  console.log('========================================');
  
  return redisUrl;
}

export function createRedisClient(options?: RedisOptions): Redis {
  const redisUrl = getRedisUrl();
  
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      // Exponential backoff capped at 2 seconds
      return Math.min(times * 50, 2000);
    },
    ...options,
  });
  
  // Add error handler to prevent unhandled errors
  client.on('error', (err) => {
    console.error('❌ [REDIS] Erro de conexão:', err.message);
  });
  
  client.on('connect', () => {
    console.log('📡 [REDIS] Conectado ao servidor');
  });
  
  client.on('ready', () => {
    console.log('✅ [REDIS] Pronto para comandos');
  });
  
  return client;
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
