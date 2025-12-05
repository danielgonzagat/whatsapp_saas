/**
 * Resolve a URL do Redis para o Worker
 * 
 * URL PÚBLICA DO REDIS - FALLBACK HARDCODED
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
 * Resolve a melhor URL do Redis:
 * 1. REDIS_PUBLIC_URL (se não for interno/localhost)
 * 2. REDIS_URL (se não for interno/localhost)
 * 3. host/port/password (se host não for interno/localhost)
 * 4. Fallback hardcoded para URL pública
 */
export function resolveRedisUrl(): string {
  // 1. Usa REDIS_PUBLIC_URL se existir e não for interno/localhost
  const publicUrl = process.env.REDIS_PUBLIC_URL;
  if (publicUrl && !isInvalidUrl(publicUrl)) {
    console.log('[WORKER/REDIS] Usando REDIS_PUBLIC_URL');
    return publicUrl;
  }
  if (publicUrl) {
    console.warn(`[WORKER/REDIS] ⚠️  REDIS_PUBLIC_URL='${publicUrl.substring(0, 30)}...' é inválido (localhost/interno)`);
  }

  // 2. Usa REDIS_URL se não for interno/localhost
  const envUrl = process.env.REDIS_URL;
  if (envUrl && !isInvalidUrl(envUrl)) {
    console.log('[WORKER/REDIS] Usando REDIS_URL (não é interno/localhost)');
    return envUrl;
  }
  if (envUrl) {
    console.warn(`[WORKER/REDIS] ⚠️  REDIS_URL='${envUrl.substring(0, 30)}...' é inválido (localhost/interno)`);
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

  if (host && !isInvalidUrl(host) && password) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
    const url = `redis://${auth}${host}:${port}`;
    console.log('[WORKER/REDIS] URL construída de REDIS_HOST/PORT (host público)');
    return url;
  }

  // Log para debug
  if (host) {
    if (isInvalidUrl(host)) {
      console.warn(`[WORKER/REDIS] ⚠️  REDIS_HOST='${host}' é inválido para produção`);
    } else if (!password) {
      console.warn('[WORKER/REDIS] ⚠️  REDIS_HOST definido mas REDIS_PASSWORD ausente');
    }
  }

  // 4. FALLBACK: Usa URL pública hardcoded
  console.warn('[WORKER/REDIS] ⚠️  Usando URL pública FALLBACK (hardcoded)');
  return REDIS_FALLBACK_URL;
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
