import Redis, { RedisOptions } from 'ioredis';

const INTERNAL_HOST_PATTERNS = ['.railway.internal', 'redis.railway.internal'];

export function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  
  console.log('========================================');
  console.log('🔍 [REDIS] Verificando REDIS_URL...');
  
  if (!redisUrl) {
    console.error('❌ [REDIS] Falta REDIS_URL no ambiente');
    console.error('📋 Defina REDIS_URL:');
    console.error('   REDIS_URL=redis://user:pass@host:port');
    throw new Error('REDIS_URL environment variable is required');
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
