/**
 * Resolve a URL do Redis para o Worker
 * 
 * ORDEM DE PRIORIDADE:
 * 1. REDIS_PUBLIC_URL (se definida)
 * 2. REDIS_URL (se definida) - ACEITA domínios internos como .railway.internal
 * 3. host/port/password montados de REDIS_HOST/REDISHOST + REDIS_PASSWORD/REDISPASSWORD
 * 4. Fallback hardcoded (apenas se NADA estiver definido)
 * 
 * IMPORTANTE: Domínios .railway.internal são ACEITOS pois funcionam dentro do Railway.
 */

const REDIS_FALLBACK_URL = process.env.REDIS_FALLBACK_URL ?? 
  'redis://default:HomYRBlzszmApvSjMllvQuWgvFBxjBCH@mainline.proxy.rlwy.net:44978';

/**
 * Verifica se uma URL aponta para localhost (apenas para avisos)
 */
function isLocalhost(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

/**
 * Resolve a melhor URL do Redis.
 */
export function resolveRedisUrl(): string {
  // Log de debug: mostrar variáveis disponíveis
  const redisVars = Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS'));
  console.log('[WORKER/REDIS] Variáveis encontradas:', redisVars.join(', ') || 'nenhuma');

  // 1. REDIS_PUBLIC_URL tem prioridade máxima
  if (process.env.REDIS_PUBLIC_URL) {
    console.log('[WORKER/REDIS] ✅ Usando REDIS_PUBLIC_URL');
    return process.env.REDIS_PUBLIC_URL;
  }

  // 2. REDIS_URL - aceita qualquer domínio, incluindo .railway.internal
  if (process.env.REDIS_URL) {
    console.log('[WORKER/REDIS] ✅ Usando REDIS_URL');
    return process.env.REDIS_URL;
  }

  // 3. Montar URL a partir de componentes (host/port/password)
  // Aceita REDIS_HOST, REDISHOST, REDIS_HOSTNAME (Railway usa REDISHOST)
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

  // Se temos host E password, monta a URL (aceita qualquer domínio)
  if (host && password) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
    const url = `redis://${auth}${host}:${port}`;
    console.log(`[WORKER/REDIS] ✅ URL construída de REDIS_HOST/PORT (host: ${host})`);
    return url;
  }

  // Log de aviso sobre o que está faltando
  if (host && !password) {
    console.warn('[WORKER/REDIS] ⚠️  REDIS_HOST definido mas REDIS_PASSWORD ausente');
  }

  // 4. FALLBACK: Nenhuma variável definida
  console.warn('[WORKER/REDIS] ⚠️  Nenhuma variável Redis configurada - usando FALLBACK');
  console.warn('[WORKER/REDIS] ⚠️  Configure REDIS_URL ou REDIS_HOST/REDIS_PASSWORD');
  return REDIS_FALLBACK_URL;
}

/**
 * Mascara a senha na URL para logs seguros.
 */
export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}

/**
 * Retorna a URL e loga um aviso se for localhost.
 */
export function getRedisUrl(): string {
  const url = resolveRedisUrl();

  if (isLocalhost(url)) {
    console.warn('⚠️  [WORKER/REDIS] URL aponta para localhost. Isso NÃO funciona em produção!');
  }

  console.log('✅ [WORKER/REDIS] Conexão configurada:', maskRedisUrl(url));
  return url;
}
