/**
 * Resolve a URL do Redis para o Worker
 * 
 * ORDEM DE PRIORIDADE:
 * 1. REDIS_PUBLIC_URL (se definida)
 * 2. REDIS_URL (se definida) - ACEITA domínios internos como .railway.internal
 * 3. host/port/password montados de REDIS_HOST/REDISHOST + REDIS_PASSWORD/REDISPASSWORD
 * 4. REDIS_FALLBACK_URL (variável de ambiente, NÃO hardcoded)
 * 5. Em produção: lança erro. Em desenvolvimento: permite localhost sem senha.
 * 
 * IMPORTANTE: Domínios .railway.internal são ACEITOS pois funcionam dentro do Railway.
 * SEGURANÇA: Não há credenciais hardcoded no código.
 */

/**
 * Classe de erro para configuração Redis ausente
 */
export class RedisConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisConfigurationError';
  }
}

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
  const isProduction = process.env.NODE_ENV === 'production';
  
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

  // Se temos host sem password (desenvolvimento local com Redis sem auth)
  if (host && !password && !isProduction) {
    const url = `redis://${host}:${port}`;
    console.warn('[WORKER/REDIS] ⚠️  Usando Redis sem autenticação (apenas desenvolvimento)');
    return url;
  }

  // 4. REDIS_FALLBACK_URL - variável de ambiente (NÃO hardcoded)
  if (process.env.REDIS_FALLBACK_URL) {
    console.warn('[WORKER/REDIS] ⚠️  Usando REDIS_FALLBACK_URL');
    return process.env.REDIS_FALLBACK_URL;
  }

  // 5. Em produção, lançar erro se nenhuma variável estiver configurada
  if (isProduction) {
    const errorMessage = `
❌ [WORKER/REDIS] ERRO DE CONFIGURAÇÃO ❌

Nenhuma variável Redis configurada para produção.
Configure uma das seguintes opções:

  Opção 1 - URL completa (recomendado):
    REDIS_URL=redis://user:password@host:port

  Opção 2 - Componentes separados:
    REDIS_HOST=seu-host-redis
    REDIS_PORT=6379
    REDIS_PASSWORD=sua-senha

  Opção 3 - URL pública:
    REDIS_PUBLIC_URL=redis://user:password@host:port

No Railway, use as variáveis fornecidas pelo plugin Redis:
  REDIS_URL, REDISHOST, REDISPORT, REDISPASSWORD
`;
    console.error(errorMessage);
    throw new RedisConfigurationError('Redis não configurado. Veja os logs para instruções.');
  }

  // Em desenvolvimento, permitir localhost:6379 como fallback
  console.warn('[WORKER/REDIS] ⚠️  Desenvolvimento: usando localhost:6379 (sem autenticação)');
  return 'redis://localhost:6379';
}

/**
 * Mascara a senha na URL para logs seguros.
 */
export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}

/**
 * Retorna a URL e loga um aviso se for localhost em produção.
 */
export function getRedisUrl(): string {
  const url = resolveRedisUrl();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isLocalhost(url) && isProduction) {
    console.error('❌ [WORKER/REDIS] URL aponta para localhost em PRODUÇÃO!');
  } else if (isLocalhost(url)) {
    console.warn('⚠️  [WORKER/REDIS] URL aponta para localhost (desenvolvimento)');
  }

  console.log('✅ [WORKER/REDIS] Conexão configurada:', maskRedisUrl(url));
  return url;
}
