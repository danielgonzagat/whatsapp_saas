import Redis, { RedisOptions } from 'ioredis';

/**
 * Constrói uma URL a partir de partes (host/porta/usuário/senha). 
 * Retorna `undefined` se o host não for informado.
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
    console.log('[REDIS] Usando REDIS_PUBLIC_URL');
    return publicUrl;
  }

  // 2. Usa REDIS_URL mesmo que seja um host interno (apenas avisa)
  const envUrl = process.env.REDIS_URL;
  if (envUrl) {
    if (envUrl.includes('.railway.internal')) {
      console.warn('[REDIS] REDIS_URL é um host interno do Railway; verifique se o serviço Redis está no mesmo projeto.');
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
      console.warn('[REDIS] Usando host interno do Railway. Certifique-se de que o backend/worker está na mesma rede.');
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

/**
 * Função compatível com a interface antiga que apenas invoca resolveRedisUrl().
 */
export function getRedisUrl(): string {
  const url = resolveRedisUrl();

  // Log de aviso se a URL contém localhost.
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    console.warn(
      '⚠️  [REDIS] Aviso: URL do Redis aponta para localhost/127.0.0.1. Isso não funciona em produção.',
    );
  }

  // Mascarar senha no log.
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
      return Math.min(times * 50, 2000); // backoff exponencial com limite de 2s
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
