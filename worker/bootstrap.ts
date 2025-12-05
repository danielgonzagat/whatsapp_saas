/**
 * Worker Bootstrap - Validação de ambiente antes de iniciar o worker
 * 
 * Este arquivo garante que Redis está configurado antes de iniciar
 * e intercepta qualquer tentativa de criar conexão inválida
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
  console.error('   REDIS_URL=redis://user:pass@host:port (não interno)');
  console.error('   REDIS_HOST + REDIS_PORT + REDIS_PASSWORD');
  console.error('');
  process.exit(1);
}

// Validar hostname
if (REDIS_URL.includes('.railway.internal')) {
  console.error('❌ URL usando hostname interno (.railway.internal)!');
  console.error('📋 Configure REDIS_PUBLIC_URL com a URL pública.');
  process.exit(1);
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

// ========== INTERCEPTAR CONEXÕES INVÁLIDAS ==========
const OriginalRedis = Redis;

const wrappedRedis = function(...args: any[]) {
  const firstArg = args[0];
  let isInvalid = false;
  let reason = '';
  
  if (!firstArg) {
    isInvalid = true;
    reason = 'REDIS SEM ARGUMENTOS - USARIA LOCALHOST';
  } else if (typeof firstArg === 'string') {
    if (firstArg.includes('127.0.0.1') || firstArg.includes('localhost')) {
      isInvalid = true;
      reason = 'REDIS COM LOCALHOST NA URL';
    }
    if (firstArg.includes('.railway.internal')) {
      isInvalid = true;
      reason = 'REDIS COM HOST INTERNO (.railway.internal)';
    }
  } else if (typeof firstArg === 'object') {
    if (!firstArg.host && !firstArg.port && !firstArg.path) {
      isInvalid = true;
      reason = 'REDIS COM OBJETO VAZIO - USARIA LOCALHOST';
    } else if (firstArg.host === '127.0.0.1' || firstArg.host === 'localhost') {
      isInvalid = true;
      reason = 'REDIS COM HOST LOCALHOST';
    } else if (firstArg.host && firstArg.host.includes('.railway.internal')) {
      isInvalid = true;
      reason = 'REDIS COM HOST INTERNO (.railway.internal)';
    }
  }
  
  if (isInvalid) {
    console.error('');
    console.error('🚨🚨�� CONEXÃO INVÁLIDA DETECTADA! 🚨🚨🚨');
    console.error('Motivo:', reason);
    console.error('Stack:', new Error().stack);
    console.error('🔧 FORÇANDO USO DE REDIS_URL:', maskRedisUrl(REDIS_URL));
    console.error('');
    
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

console.log('✅ Interceptação de conexões inválidas ativada');
console.log('========================================');
console.log('');

// ========== INICIAR PROCESSOR ==========
console.log('🚀 Iniciando processor...');
import('./processor');
