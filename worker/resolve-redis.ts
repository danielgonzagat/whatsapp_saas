/**
 * Resolve a URL do Redis para o Worker
 * 
 * Lógica centralizada que aceita múltiplas variáveis de ambiente
 * e ignora hostnames internos (.railway.internal)
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
 * - REDIS_URL (se não for interno)
 * - host/port/user/password (com e sem underscore)
 */
export function resolveRedisUrl(): string {
  // 1. Use a URL pública, se existir.
  const publicUrl = process.env.REDIS_PUBLIC_URL;
  if (publicUrl) {
    console.log('�� [WORKER/REDIS] Usando REDIS_PUBLIC_URL');
    return publicUrl;
  }

  // 2. Use REDIS_URL se não estiver apontando para host interno.
  const envUrl = process.env.REDIS_URL;
  if (envUrl && !envUrl.includes('.railway.internal')) {
    console.log('🔍 [WORKER/REDIS] Usando REDIS_URL (não é interno)');
    return envUrl;
  }

  if (envUrl && envUrl.includes('.railway.internal')) {
    console.warn('⚠️  [WORKER/REDIS] REDIS_URL contém .railway.internal, ignorando...');
  }

  // 3. Tente compor a URL a partir de variáveis de host/port.
  const host =
    process.env.REDIS_HOST ||
    process.env.REDISHOST ||
    process.env.REDIS_HOSTNAME;
  const port =
    process.env.REDIS_PORT ||
    process.env.REDISPORT ||
    process.env.REDIS_PORT_NUM ||
    '6379';
  const user =
    process.env.REDIS_USERNAME ||
    process.env.REDISUSER ||
    process.env.REDIS_USER;
  const password =
    process.env.REDIS_PASSWORD ||
    process.env.REDISPASSWORD ||
    process.env.REDIS_PASS;

  // Verificar se o host é interno
  if (host && host.includes('.railway.internal')) {
    console.warn('⚠️  [WORKER/REDIS] REDIS_HOST contém .railway.internal, ignorando...');
  } else {
    const built = buildRedisUrl(host, port, user, password);
    if (built) {
      console.log('🔍 [WORKER/REDIS] URL construída de REDIS_HOST/PORT');
      return built;
    }
  }

  throw new Error(
    'Não foi possível determinar a URL do Redis. Defina REDIS_PUBLIC_URL, REDIS_URL ou REDIS_HOST/PORT/USER/PASSWORD.',
  );
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
