/**
 * Worker Bootstrap - Validação de ambiente antes de iniciar o worker
 * 
 * Este arquivo garante que REDIS_URL está configurado antes de iniciar
 * e intercepta qualquer tentativa de criar conexão localhost
 */

import Redis from 'ioredis';

// ========== VALIDAÇÃO OBRIGATÓRIA ==========
const REDIS_URL = process.env.REDIS_URL;

console.log('========================================');
console.log('🔧 WORKER BOOTSTRAP - VALIDAÇÃO');
console.log('========================================');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REDIS_URL definido:', !!REDIS_URL);

if (REDIS_URL) {
  try {
    const url = new URL(REDIS_URL);
    console.log('REDIS Host:', url.hostname);
    console.log('REDIS Port:', url.port);
  } catch {
    console.log('REDIS_URL (raw):', REDIS_URL.substring(0, 50) + '...');
  }
}

if (!REDIS_URL) {
  console.error('❌❌❌ ERRO FATAL: REDIS_URL não está definido! ❌❌❌');
  console.error('O worker não pode funcionar sem REDIS_URL.');
  console.error('Configure a variável de ambiente REDIS_URL e reinicie.');
  process.exit(1);
}

// ========== INTERCEPTAR CONEXÕES LOCALHOST ==========
const OriginalRedis = Redis;

// Wrapper para detectar conexões localhost
const wrappedRedis = function(...args: any[]) {
  const firstArg = args[0];
  
  // Detectar se está tentando usar localhost
  let isLocalhost = false;
  
  if (!firstArg) {
    isLocalhost = true;
    console.error('🚨🚨🚨 REDIS SEM ARGUMENTOS - USARIA LOCALHOST! 🚨🚨🚨');
  } else if (typeof firstArg === 'string') {
    if (firstArg.includes('127.0.0.1') || firstArg.includes('localhost')) {
      isLocalhost = true;
      console.error('🚨🚨🚨 REDIS COM LOCALHOST NA URL! 🚨🚨🚨');
    }
  } else if (typeof firstArg === 'object') {
    if (!firstArg.host && !firstArg.port && !firstArg.path) {
      isLocalhost = true;
      console.error('🚨🚨🚨 REDIS COM OBJETO VAZIO - USARIA LOCALHOST! 🚨🚨🚨');
    } else if (firstArg.host === '127.0.0.1' || firstArg.host === 'localhost') {
      isLocalhost = true;
      console.error('🚨🚨🚨 REDIS COM HOST LOCALHOST! 🚨🚨🚨');
    }
  }
  
  if (isLocalhost) {
    console.error('Stack trace:');
    console.error(new Error().stack);
    console.error('Argumentos recebidos:', JSON.stringify(args, null, 2));
    console.error('');
    console.error('🔧 FORÇANDO USO DE REDIS_URL:', REDIS_URL?.substring(0, 50) + '...');
    
    // Forçar uso do REDIS_URL correto
    // @ts-ignore
    return new OriginalRedis(REDIS_URL);
  }
  
  // Conexão normal
  // @ts-ignore
  return new OriginalRedis(...args);
} as typeof Redis;

// Copiar propriedades estáticas
Object.setPrototypeOf(wrappedRedis, OriginalRedis);
Object.assign(wrappedRedis, OriginalRedis);

// Substituir globalmente
// @ts-ignore
global.Redis = wrappedRedis;

console.log('✅ Interceptação de Redis localhost ativada');
console.log('========================================');
console.log('');

// ========== INICIAR PROCESSOR ==========
console.log('🚀 Iniciando processor...');
import('./processor');
