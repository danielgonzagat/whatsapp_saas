/**
 * Worker Bootstrap - Validação de ambiente antes de iniciar o worker
 * 
 * Este arquivo garante que Redis está configurado antes de iniciar
 * Aceita hosts internos do Railway (.railway.internal)
 */

import Redis from 'ioredis';
import { resolveRedisUrl, maskRedisUrl } from './resolve-redis';

console.log('========================================');
console.log('🔧 WORKER BOOTSTRAP - VALIDAÇÃO');
console.log('========================================');
console.log('NODE_ENV:', process.env.NODE_ENV);

// Mostrar todas as variáveis REDIS
const redisVars = Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS'));
console.log('Variáveis REDIS encontradas:', redisVars.length);
redisVars.forEach(k => {
  const value = process.env[k] || '';
  const safeValue = value.replace(/:[^:@]+@/, ':***@');
  console.log(`   ${k}: ${safeValue.substring(0, 60)}`);
});

let REDIS_URL: string;
try {
  REDIS_URL = resolveRedisUrl();
  console.log('✅ URL resolvida:', maskRedisUrl(REDIS_URL));
  
  // Exportar para uso por outros módulos
  process.env.REDIS_URL = REDIS_URL;
} catch (err: any) {
  console.error('');
  console.error('❌❌❌ ERRO FATAL:', err.message, '❌❌❌');
  console.error('');
  console.error('Configure uma das opções:');
  console.error('   REDIS_PUBLIC_URL=redis://user:pass@host:port');
  console.error('   REDIS_URL=redis://user:pass@host:port');
  console.error('   REDIS_HOST + REDIS_PORT + REDIS_PASSWORD');
  console.error('');
  process.exit(1);
}

// Aviso se for host interno (mas não bloqueia mais)
if (REDIS_URL.includes('.railway.internal')) {
  console.warn('⚠️  URL do Redis é um host interno do Railway.');
  console.warn('⚠️  Certifique-se de que o worker está na mesma rede do Redis.');
}

if (REDIS_URL.includes('localhost') || REDIS_URL.includes('127.0.0.1')) {
  console.warn('⚠️  AVISO: URL aponta para localhost!');
}

try {
  const url = new URL(REDIS_URL);
  console.log('✅ REDIS Host:', url.hostname);
  console.log('✅ REDIS Port:', url.port || '6379');
} catch {
  console.log('✅ REDIS_URL configurada');
}

// ========== INTERCEPTAR CONEXÕES LOCALHOST ==========
const OriginalRedis = Redis;

const wrappedRedis = function(...args: any[]) {
  const firstArg = args[0];
  let isLocalhost = false;
  let reason = '';
  
  // Detectar apenas localhost (não bloqueia mais .railway.internal)
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
    console.error('🚨 CONEXÃO LOCALHOST DETECTADA! 🚨');
    console.error('Motivo:', reason);
    console.error('🔧 FORÇANDO USO DE REDIS_URL:', maskRedisUrl(REDIS_URL));
    
    // @ts-ignore
    return new OriginalRedis(REDIS_URL);
  }
  
  // @ts-ignore
  return new OriginalRedis(...args);
} as typeof Redis;

Object.setPrototypeOf(wrappedRedis, OriginalRedis);
Object.assign(wrappedRedis, OriginalRedis);

// @ts-ignore
global.Redis = wrappedRedis;

console.log('✅ Interceptação de conexões localhost ativada');
console.log('========================================');
console.log('');

// ========== INICIAR PROCESSOR ==========
console.log('🚀 Iniciando processor...');
import('./processor');
