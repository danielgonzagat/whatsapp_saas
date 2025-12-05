/**
 * Worker Bootstrap - Validação de ambiente antes de iniciar o worker
 * 
 * Este arquivo garante que Redis está configurado antes de iniciar
 * e intercepta qualquer tentativa de criar conexão localhost
 */

import Redis from 'ioredis';

// ========== CONSTRUIR REDIS_URL SE NECESSÁRIO ==========
function buildRedisUrlFromComponents(): string | undefined {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;
  const username = process.env.REDIS_USERNAME ?? process.env.REDIS_USER;
  
  if (!host) return undefined;
  
  const auth = username && password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : password
      ? `${encodeURIComponent(password)}@`
      : '';
  
  return `redis://${auth}${host}:${port}`;
}

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

let REDIS_URL: string | undefined = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn('⚠️  REDIS_URL não definida, tentando REDIS_HOST/PORT...');
  REDIS_URL = buildRedisUrlFromComponents();
  
  if (REDIS_URL) {
    const maskedUrl = REDIS_URL.replace(/:[^:@]+@/, ':***@');
    console.warn('⚠️  URL construída de REDIS_HOST/PORT:', maskedUrl);
    // Exportar para uso por outros módulos
    process.env.REDIS_URL = REDIS_URL;
  } else {
    console.error('');
    console.error('❌❌❌ ERRO FATAL: REDIS_URL e REDIS_HOST não definidas! ❌❌❌');
    console.error('');
    console.error('Configure REDIS_URL ou REDIS_HOST/REDIS_PORT:');
    console.error('   REDIS_URL=redis://user:pass@host:port');
    console.error('   ou');
    console.error('   REDIS_HOST=host REDIS_PORT=port REDIS_PASSWORD=senha');
    console.error('');
    process.exit(1);
  }
}

// Validar hostname
if (REDIS_URL.includes('.railway.internal')) {
  console.error('❌ REDIS_URL usando hostname interno (.railway.internal)!');
  console.error('📋 Use a URL PÚBLICA do Redis.');
  process.exit(1);
}

if (REDIS_URL.includes('localhost') || REDIS_URL.includes('127.0.0.1')) {
  console.warn('⚠️  AVISO: REDIS_URL aponta para localhost!');
  console.warn('⚠️  Em containers/produção isso não funciona.');
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
