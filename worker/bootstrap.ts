/**
 * Worker Bootstrap - Entry point com interceptação de Redis ANTES de qualquer import
 * 
 * IMPORTANTE: Este arquivo NÃO PODE importar nenhum módulo que use ioredis
 * até DEPOIS de configurar a interceptação!
 */

console.log('========================================');
console.log('🔧 WORKER BOOTSTRAP - VALIDAÇÃO');
console.log('========================================');
console.log('NODE_ENV:', process.env.NODE_ENV);

// ========== PASSO 1: RESOLVER URL DO REDIS (SEM IMPORTAR NADA) ==========

function resolveRedisUrlLocal(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Log de debug
  const redisVars = Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS'));
  console.log('[WORKER] Variáveis REDIS encontradas:', redisVars.join(', ') || 'nenhuma');
  redisVars.forEach(k => {
    const value = process.env[k] || '';
    const safeValue = value.replace(/:[^:@]+@/, ':***@');
    console.log(`   ${k}: ${safeValue.substring(0, 80)}`);
  });

  // 1. REDIS_PUBLIC_URL tem prioridade máxima
  if (process.env.REDIS_PUBLIC_URL) {
    console.log('[WORKER] ✅ Usando REDIS_PUBLIC_URL');
    return process.env.REDIS_PUBLIC_URL;
  }

  // 2. REDIS_URL - aceita qualquer domínio
  if (process.env.REDIS_URL) {
    console.log('[WORKER] ✅ Usando REDIS_URL');
    return process.env.REDIS_URL;
  }

  // 3. Montar URL a partir de componentes
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

  if (host && password) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
    const url = `redis://${auth}${host}:${port}`;
    console.log(`[WORKER] ✅ URL construída de REDIS_HOST/PORT (host: ${host})`);
    return url;
  }

  if (host && !password && !isProduction) {
    const url = `redis://${host}:${port}`;
    console.warn('[WORKER] ⚠️  Usando Redis sem autenticação (apenas desenvolvimento)');
    return url;
  }

  // 4. REDIS_FALLBACK_URL
  if (process.env.REDIS_FALLBACK_URL) {
    console.warn('[WORKER] ⚠️  Usando REDIS_FALLBACK_URL');
    return process.env.REDIS_FALLBACK_URL;
  }

  // 5. Em produção, avisa mas NÃO derruba o serviço
  if (isProduction) {
    console.error('');
    console.error('⚠️ ============================================');
    console.error('⚠️ [WORKER] AVISO: Redis NÃO configurado');
    console.error('⚠️ ============================================');
    console.error('');
    console.error('📋 Configure uma das opções para habilitar o worker:');
    console.error('   REDIS_PUBLIC_URL=redis://user:pass@host:port');
    console.error('   REDIS_URL=redis://user:pass@host:port');
    console.error('   REDIS_HOST + REDIS_PORT + REDIS_PASSWORD');
    console.error('');
    console.error('⚠️ O worker não processará jobs sem Redis.');
    console.error('');
    // Retorna string vazia - o processor deve verificar e não iniciar workers
    return '';
  }

  // Desenvolvimento: localhost
  console.warn('[WORKER] ⚠️  Desenvolvimento: usando localhost:6379');
  return 'redis://localhost:6379';
}

// Resolver URL AGORA, antes de qualquer import
const RESOLVED_REDIS_URL = resolveRedisUrlLocal();
const maskedUrl = RESOLVED_REDIS_URL ? RESOLVED_REDIS_URL.replace(/:[^:@]*@/, ':***@') : '(não configurado)';
console.log('✅ [WORKER] URL do Redis resolvida:', maskedUrl);

// Garantir que REDIS_URL está definida para todos os módulos
process.env.REDIS_URL = RESOLVED_REDIS_URL;

// Aviso para hosts internos Railway
if (RESOLVED_REDIS_URL.includes('.railway.internal')) {
  console.warn('⚠️  [WORKER] URL usa host interno Railway (.railway.internal)');
  console.warn('⚠️  Certifique-se de que o worker está na mesma rede do Redis.');
}

console.log('');

// ========== PASSO 2: INTERCEPTAR IOREDIS ANTES DE QUALQUER OUTRO IMPORT ==========
console.log('🔧 [WORKER] Configurando interceptação de conexões Redis...');

const originalRedisConstructor = require('ioredis');

const wrapRedis = function(...args: any[]) {
  const firstArg = args[0];
  
  let isLocalhost = false;
  let reason = '';
  
  if (!firstArg) {
    isLocalhost = true;
    reason = 'REDIS SEM ARGUMENTOS - USARIA LOCALHOST';
  } else if (typeof firstArg === 'string') {
    if (firstArg.includes('127.0.0.1') || firstArg.includes('localhost')) {
      isLocalhost = true;
      reason = 'REDIS COM LOCALHOST NA URL';
    }
  } else if (typeof firstArg === 'object') {
    if (!firstArg.host && !firstArg.port && !firstArg.path) {
      isLocalhost = true;
      reason = 'REDIS COM OBJETO VAZIO - USARIA LOCALHOST';
    } else if (firstArg.host === '127.0.0.1' || firstArg.host === 'localhost') {
      isLocalhost = true;
      reason = 'REDIS COM HOST LOCALHOST';
    }
  }
  
  if (isLocalhost) {
    console.error('');
    console.error('🚨 [WORKER-INTERCEPT] CONEXÃO LOCALHOST DETECTADA! 🚨');
    console.error('Motivo:', reason);
    console.error('🔧 FORÇANDO USO DE REDIS_URL:', maskedUrl);
    console.error('');
    
    // Forçar uso da URL resolvida
    return new originalRedisConstructor(RESOLVED_REDIS_URL);
  }
  
  // Log para conexões válidas
  if (typeof firstArg === 'string') {
    const safe = firstArg.replace(/:[^:@]+@/, ':***@');
    console.log('🔍 [WORKER-TRACE] Nova conexão Redis:', safe.substring(0, 60));
  } else if (firstArg && typeof firstArg === 'object' && firstArg.host) {
    console.log('🔍 [WORKER-TRACE] Nova conexão Redis: Host:', firstArg.host);
  }
  
  return new originalRedisConstructor(...args);
};

// Copiar propriedades estáticas
wrapRedis.Cluster = originalRedisConstructor.Cluster;
wrapRedis.Command = originalRedisConstructor.Command;
Object.setPrototypeOf(wrapRedis, originalRedisConstructor);

// Substituir no cache de módulos ANTES de qualquer outro import
require.cache[require.resolve('ioredis')]!.exports = wrapRedis;
require.cache[require.resolve('ioredis')]!.exports.default = wrapRedis;

console.log('✅ [WORKER] Interceptação de conexões localhost ativada');
console.log('========================================');
console.log('');
console.log('🚀 [WORKER] Iniciando processor...');
console.log('========================================');

// ========== PASSO 3: AGORA SIM, IMPORTAR E EXECUTAR O PROCESSOR ==========
import('./processor');
