/**
 * Resolve a URL do Redis para o Worker
 * 
 * Lógica centralizada que aceita múltiplas variáveis de ambiente
 * Aceita hosts internos do Railway (.railway.internal) com aviso
 */

/**
 * Constrói uma URL a partir de partes (host/porta/usuário/senha). 
 */
function buildRedisUrl(
  host: string | undefined,
  port: string | undefined,
  user: string | undefined,
  password: string | undefined,
): string | undefined {
  if (!host) return undefined;
  const portUse = port || '6379';
  let auth = '';
  if (user && password) {
    auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
  } else if (password) {
    auth = `${encodeURIComponent(password)}@`;
  }
  return `redis://${auth}${host}:${portUse}`;
}

/**
 * Resolve a melhor URL do Redis olhando várias variáveis:
 * - REDIS_PUBLIC_URL (prioridade máxima)
 * - REDIS_URL (aceita hosts internos do Railway)
 * - host/port/user/password (com e sem underscore)
 */
export function resolveRedisUrl(): string {
  // 1. Usa REDIS_PUBLIC_URL se existir
  const publicUrl = process.env.REDIS_PUBLIC_URL;
  if (publicUrl) {
    console.log('[WORKER/REDIS] Usando REDIS_PUBLIC_URL');
    return publicUrl;
  }

  // 2. Usa REDIS_URL mesmo que seja um host interno (apenas avisa)
  const envUrl = process.env.REDIS_URL;
  if (envUrl) {
    if (envUrl.includes('.railway.internal')) {
      console.warn('[WORKER/REDIS] REDIS_URL é um host interno do Railway; verifique se o serviço Redis está no mesmo projeto.');
    }
    return envUrl;
  }

  // 3. Monta a URL a partir de REDIS_HOST, REDIS_PORT, REDIS_USER, REDIS_PASSWORD
  const host = 
    process.env.REDIS_HOST ?? 
    process.env.REDISHOST ?? 
    process.env.REDIS_HOSTNAME;
  const port = 
    process.env.REDIS_PORT ?? 
    process.env.REDISPORT ?? 
    process.env.REDIS_PORT_NUM ?? 
    '6379';
  const user = 
    process.env.REDIS_USERNAME ?? 
    process.env.REDISUSER ?? 
    process.env.REDIS_USER;
  const password = 
    process.env.REDIS_PASSWORD ?? 
    process.env.REDISPASSWORD ?? 
    process.env.REDIS_PASS;

  // Monta a URL mesmo para hosts internos
  if (host) {
    if (host.includes('.railway.internal')) {
      console.warn('[WORKER/REDIS] Usando host interno do Railway. Certifique-se de que o worker está na mesma rede.');
    }
    const auth = user && password 
      ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
      : password 
        ? `${encodeURIComponent(password)}@`
        : '';
    return `redis://${auth}${host}:${port}`;
  }

  // Se ainda não conseguiu determinar a URL, lança erro
  throw new Error(
    'Não foi possível determinar a URL do Redis. Defina REDIS_PUBLIC_URL, REDIS_URL ou REDIS_HOST/PORT/USER/PASSWORD.',
  );
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
