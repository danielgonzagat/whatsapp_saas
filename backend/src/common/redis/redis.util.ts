import Redis, { RedisOptions } from 'ioredis';

/**
 * URL PÚBLICA DO REDIS - FALLBACK HARDCODED
 * 
 * Se nenhuma variável de ambiente válida for encontrada,
 * usa esta URL pública do Railway.
 */
const REDIS_FALLBACK_URL = 'redis://default:HomYRBlzszmApvSjMllvQuWgvFBxjBCH@mainline.proxy.rlwy.net:44978';

/**
 * Verifica se uma URL ou host é inválido para produção
 */
function isInvalidUrl(url: string): boolean {
  return url.includes('localhost') || 
         url.includes('127.0.0.1') || 
         url.includes('.railway.internal');
}

/**
 * Resolve a melhor URL do Redis olhando várias variáveis:
 * 1. REDIS_PUBLIC_URL (prioridade máxima, se não for interno/localhost)
 * 2. REDIS_URL (se não for interno/localhost)
 * 3. host/port/user/password (se host não for interno/localhost)
 * 4. Fallback hardcoded para URL pública
 */
export function resolveRedisUrl(): string {
  // 1. Usa REDIS_PUBLIC_URL se existir e não for interno/localhost
  const publicUrl = process.env.REDIS_PUBLIC_URL;
  if (publicUrl && !isInvalidUrl(publicUrl)) {
    console.log('[REDIS] Usando REDIS_PUBLIC_URL');
    return publicUrl;
  }
  if (publicUrl) {
    console.warn(`[REDIS] ⚠️  REDIS_PUBLIC_URL='${publicUrl.substring(0, 30)}...' é inválido (localhost/interno)`);
  }

  // 2. Usa REDIS_URL se não for interno/localhost
  const envUrl = process.env.REDIS_URL;
  if (envUrl && !isInvalidUrl(envUrl)) {
    console.log('[REDIS] Usando REDIS_URL (não é interno/localhost)');
    return envUrl;
  }
  if (envUrl) {
    console.warn(`[REDIS] ⚠️  REDIS_URL='${envUrl.substring(0, 30)}...' é inválido (localhost/interno)`);
  }

  // 3. Tenta montar URL a partir de componentes (se host não for interno/localhost)
  const host = 
    process.env.REDIS_HOST ?? 
    process.env.REDISHOST ?? 
    process.env.REDIS_HOSTNAME;
  const port = 
    process.env.REDIS_PORT ?? 
    process.env.REDISPORT ?? 
    '6379';
  const user = 
    process.env.REDIS_USERNAME ?? 
    process.env.REDISUSER ?? 
    process.env.REDIS_USER ?? 
    'default';
  const password = 
    process.env.REDIS_PASSWORD ?? 
    process.env.REDISPASSWORD ?? 
    process.env.REDIS_PASS;

  // Se temos host e ele NÃO é interno/localhost, usa
  if (host && !isInvalidUrl(host) && password) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
    const url = `redis://${auth}${host}:${port}`;
    console.log('[REDIS] URL construída de REDIS_HOST/PORT (host público)');
    return url;
  }

  // Log para debug: mostra por que estamos indo para fallback
  if (host) {
    if (isInvalidUrl(host)) {
      console.warn(`[REDIS] ⚠️  REDIS_HOST='${host}' é inválido para produção`);
    } else if (!password) {
      console.warn('[REDIS] ⚠️  REDIS_HOST definido mas REDIS_PASSWORD ausente');
    }
  }

  // 4. FALLBACK: Se tudo acima falhou ou aponta para interno, usa URL pública hardcoded
  console.warn('[REDIS] ⚠️  Usando URL pública FALLBACK (hardcoded)');
  console.warn('[REDIS] ⚠️  Variáveis apontam para .railway.internal ou não existem');
  return REDIS_FALLBACK_URL;
}

/**
 * Função compatível com a interface antiga.
 */
export function getRedisUrl(): string {
  const url = resolveRedisUrl();

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    console.warn('⚠️  [REDIS] URL aponta para localhost. Não funciona em produção.');
  }

  const masked = url.replace(/:[^:@]+@/, ':***@');
  console.log('✅ [REDIS] Usando URL:', masked);
  return url;
}

/**
 * Cria um cliente Redis padrão com opções de retry.
 */
export function createRedisClient(options?: RedisOptions): Redis {
  const url = getRedisUrl();
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
    ...options,
  });

  client.on('error', (err) => {
    console.error('❌ [REDIS] Erro de conexão:', err.message);
  });

  client.on('ready', () => {
    console.log('✅ [REDIS] Conexão pronta');
  });

  return client;
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
