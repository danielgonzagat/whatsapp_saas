/**
 * Resolve a URL do Redis para o Worker
 * 
 * URL PÚBLICA DO REDIS - FALLBACK HARDCODED
 */
const REDIS_FALLBACK_URL = 'redis://default:HomYRBlzszmApvSjMllvQuWgvFBxjBCH@mainline.proxy.rlwy.net:44978';

/**
 * Resolve a melhor URL do Redis:
 * 1. REDIS_PUBLIC_URL (se não for interno)
 * 2. REDIS_URL (se não for interno)
 * 3. host/port/password (se host não for interno)
 * 4. Fallback hardcoded para URL pública
 */
export function resolveRedisUrl(): string {
  // 1. Usa REDIS_PUBLIC_URL se existir e não for interno
  const publicUrl = process.env.REDIS_PUBLIC_URL;
  if (publicUrl && !publicUrl.includes('.railway.internal')) {
    console.log('[WORKER/REDIS] Usando REDIS_PUBLIC_URL');
    return publicUrl;
  }

  // 2. Usa REDIS_URL se não for interno
  const envUrl = process.env.REDIS_URL;
  if (envUrl && !envUrl.includes('.railway.internal')) {
    console.log('[WORKER/REDIS] Usando REDIS_URL (não é interno)');
    return envUrl;
  }

  // 3. Tenta montar URL a partir de componentes (se host não for interno)
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

  if (host && !host.includes('.railway.internal') && password) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
    const url = `redis://${auth}${host}:${port}`;
    console.log('[WORKER/REDIS] URL construída de REDIS_HOST/PORT (host público)');
    return url;
  }

  // 4. FALLBACK: Usa URL pública hardcoded
  console.warn('[WORKER/REDIS] ⚠️  Usando URL pública FALLBACK (hardcoded)');
  return REDIS_FALLBACK_URL;
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
