import Redis, { RedisOptions } from 'ioredis';
import { EventEmitter } from 'events';

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
 * Resolve a URL do Redis olhando várias variáveis:
 * 
 * ORDEM DE PRIORIDADE:
 * 1. REDIS_PUBLIC_URL (se definida)
 * 2. REDIS_URL (se definida) - ACEITA domínios internos como .railway.internal
 * 3. host/port/password montados de REDIS_HOST/REDISHOST + REDIS_PASSWORD/REDISPASSWORD
 * 4. REDIS_FALLBACK_URL (variável de ambiente, NÃO hardcoded)
 * 5. Em produção: lança erro. Em desenvolvimento: permite localhost sem senha.
 * 
 * IMPORTANTE: Domínios .railway.internal são ACEITOS pois funcionam dentro do Railway.
 */
export function resolveRedisUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
  
  // Log de debug: mostrar variáveis disponíveis
  const redisVars = Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS'));
  if (!isTest) {
    console.log('[REDIS] Variáveis encontradas:', redisVars.join(', ') || 'nenhuma');
  }

  // 1. REDIS_PUBLIC_URL tem prioridade máxima (geralmente a URL externa/pública)
  if (process.env.REDIS_PUBLIC_URL) {
    if (!isTest) console.log('[REDIS] ✅ Usando REDIS_PUBLIC_URL');
    return process.env.REDIS_PUBLIC_URL;
  }

  // 2. REDIS_URL - aceita qualquer domínio, incluindo .railway.internal
  if (process.env.REDIS_URL) {
    if (!isTest) console.log('[REDIS] ✅ Usando REDIS_URL');
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
    if (!isTest) console.log(`[REDIS] ✅ URL construída de REDIS_HOST/PORT (host: ${host})`);
    return url;
  }

  // Se temos host sem password (desenvolvimento local com Redis sem auth)
  if (host && !password && !isProduction) {
    const url = `redis://${host}:${port}`;
    if (!isTest) {
      console.warn('[REDIS] ⚠️  Usando Redis sem autenticação (apenas desenvolvimento)');
    }
    return url;
  }

  // 4. REDIS_FALLBACK_URL - variável de ambiente (NÃO hardcoded)
  if (process.env.REDIS_FALLBACK_URL) {
    if (!isTest) console.warn('[REDIS] ⚠️  Usando REDIS_FALLBACK_URL');
    return process.env.REDIS_FALLBACK_URL;
  }

  // 5. Em produção, lançar erro se nenhuma variável estiver configurada
  if (isProduction) {
    const errorMessage = `
❌ [REDIS] ERRO DE CONFIGURAÇÃO ❌

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

  Opção 4 - Fallback:
    REDIS_FALLBACK_URL=redis://user:password@host:port

No Railway, use as variáveis fornecidas pelo plugin Redis:
  REDIS_URL, REDISHOST, REDISPORT, REDISPASSWORD
`;
    if (!isTest) console.error(errorMessage);
    throw new RedisConfigurationError('Redis não configurado. Veja os logs para instruções.');
  }

  // Em desenvolvimento, permitir localhost:6379 como fallback
  if (!isTest) {
    console.warn('[REDIS] ⚠️  Desenvolvimento: usando localhost:6379 (sem autenticação)');
  }
  return 'redis://localhost:6379';
}

/**
 * Função compatível com a interface antiga.
 * Retorna a URL do Redis e loga um aviso se for localhost em produção.
 */
export function getRedisUrl(): string {
  const url = resolveRedisUrl();
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

  // Se URL vazia, Redis não está configurado
  if (!url) {
    if (!isTest) {
      console.warn(
        '⚠️  [REDIS] Nenhuma URL configurada. Funcionalidades Redis desativadas.',
      );
    }
    return '';
  }

  if (isLocalhost(url) && isProduction) {
    console.error('❌ [REDIS] URL aponta para localhost em PRODUÇÃO!');
    console.error('❌ [REDIS] Isso NÃO vai funcionar. Configure REDIS_URL corretamente.');
  } else if (isLocalhost(url) && !isTest) {
    console.warn('⚠️  [REDIS] URL aponta para localhost (desenvolvimento)');
  }

  const masked = maskRedisUrl(url);
  if (!isTest) {
    console.log('✅ [REDIS] Conexão configurada:', masked);
  }
  return url;
}

/**
 * Mascara a senha na URL para logs seguros.
 */
export function maskRedisUrl(url: string): string {
  if (!url) return '(não configurado)';
  return url.replace(/:[^:@]*@/, ':***@');
}

/**
 * Verifica se Redis está configurado e disponível
 */
export function isRedisConfigured(): boolean {
  const directUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL;
  if (directUrl && directUrl.length > 0) return true;

  const host =
    process.env.REDIS_HOST ?? process.env.REDISHOST ?? process.env.REDIS_HOSTNAME;
  const password = process.env.REDIS_PASSWORD ?? process.env.REDISPASSWORD ?? process.env.REDIS_PASS;
  if (host && password) return true;

  return false;
}

/**
 * Cria um cliente Redis padrão com opções de retry.
 * Retorna null se Redis não estiver configurado.
 */
export function createRedisClient(options?: RedisOptions): Redis | null {
  // Avoid real network connections during Jest runs, but still provide a usable client.
  if (process.env.JEST_WORKER_ID) {
    const store = new Map<string, any>();
    const emitter = new EventEmitter();

    const client: any = {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: any) => {
        store.set(key, value);
        return 'OK';
      },
      setex: async (key: string, _ttl: number, value: any) => {
        store.set(key, value);
        return 'OK';
      },
      incr: async (key: string) => {
        const v = (store.get(key) || 0) + 1;
        store.set(key, v);
        return v;
      },
      incrby: async (key: string, n: number) => {
        const v = (store.get(key) || 0) + n;
        store.set(key, v);
        return v;
      },
      expire: async () => 1,
      lrange: async () => [],
      rpush: async () => 0,
      publish: async () => 1,
      subscribe: async () => 1,
      psubscribe: async () => 1,
      on: (event: string, listener: (...args: any[]) => void) => {
        emitter.on(event, listener);
        return client;
      },
      emit: (event: string, ...args: any[]) => emitter.emit(event, ...args),
      duplicate: () => client,
      quit: async () => 'OK',
      disconnect: () => undefined,
    };

    return client as Redis;
  }

  const url = getRedisUrl();
  
  // Se URL vazia, Redis não está configurado
  if (!url) {
    console.warn('⚠️  [REDIS] Cliente não criado - Redis não configurado');
    return null as any; // Retorna null mas mantém tipo para compatibilidade
  }

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
