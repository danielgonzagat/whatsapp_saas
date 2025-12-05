/**
 * Bootstrap - Validação de ambiente ANTES de carregar qualquer módulo
 * 
 * Este arquivo é o entry point real da aplicação.
 * Ele valida as variáveis de ambiente ANTES de importar qualquer coisa.
 */

console.log('========================================');
console.log('🔍 [PRE-BOOT] Verificando variáveis de ambiente Redis...');
console.log('========================================');

// Mostrar todas as variáveis relacionadas a Redis
const redisVars = Object.keys(process.env).filter(k => 
  k.toUpperCase().includes('REDIS')
);
console.log('🔍 [PRE-BOOT] Variáveis REDIS encontradas:', redisVars.length);
redisVars.forEach(k => {
  const value = process.env[k] || '';
  // Ocultar senha
  const safeValue = value.replace(/:[^:@]+@/, ':***@');
  console.log(`   ${k}: ${safeValue.substring(0, 80)}`);
});

// Importar função centralizada de resolução de URL
import { resolveRedisUrl } from './common/redis/redis.util';

let redisUrl: string;
try {
  redisUrl = resolveRedisUrl();
  // Mascarar senha
  const masked = redisUrl.replace(/:[^:@]+@/, ':***@');
  console.log('✅ [PRE-BOOT] URL do Redis definida como:', masked);
  
  // Exportar para uso por outros módulos que não usam resolveRedisUrl
  process.env.REDIS_URL = redisUrl;
} catch (err: any) {
  console.error('');
  console.error('❌ ============================================');
  console.error('❌ [PRE-BOOT] Problema ao determinar a URL do Redis:');
  console.error('❌ ============================================');
  console.error(err.message);
  console.error('');
  console.error('📋 Configure uma das opções:');
  console.error('   REDIS_PUBLIC_URL=redis://user:pass@host:port');
  console.error('   REDIS_URL=redis://user:pass@host:port');
  console.error('   REDIS_HOST + REDIS_PORT + REDIS_PASSWORD');
  console.error('');
  process.exit(1);
}

// Aviso se for host interno (mas não bloqueia mais)
if (redisUrl.includes('.railway.internal')) {
  console.warn('⚠️  [PRE-BOOT] URL do Redis é um host interno do Railway.');
  console.warn('⚠️  Certifique-se de que o backend está na mesma rede do Redis.');
}

console.log('');

// ========== INTERCEPTAR CONEXÕES LOCALHOST ==========
const originalRedisConstructor = require('ioredis');
const wrapRedis = function(...args: any[]) {
  const firstArg = args[0];
  
  // Detectar apenas localhost (não bloqueia mais .railway.internal)
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
    console.error('🚨 CONEXÃO LOCALHOST DETECTADA! 🚨');
    console.error('Motivo:', reason);
    console.error('🔧 FORÇANDO USO DE REDIS_URL:', redisUrl?.replace(/:[^:@]+@/, ':***@').substring(0, 60));
    console.error('');
    
    // Forçar uso do REDIS_URL correto
    return new originalRedisConstructor(redisUrl);
  }
  
  // Log normal para conexões válidas
  console.log('🔍 [REDIS-TRACE] Nova conexão Redis:');
  if (typeof firstArg === 'string') {
    console.log('   URL:', firstArg.replace(/:[^:@]+@/, ':***@').substring(0, 60));
  } else if (firstArg && typeof firstArg === 'object') {
    console.log('   Host:', firstArg.host, 'Port:', firstArg.port);
  }
  
  return new originalRedisConstructor(...args);
};

// Copiar propriedades estáticas
wrapRedis.Cluster = originalRedisConstructor.Cluster;
wrapRedis.Command = originalRedisConstructor.Command;
Object.setPrototypeOf(wrapRedis, originalRedisConstructor);

// Substituir no cache de módulos
require.cache[require.resolve('ioredis')]!.exports = wrapRedis;
require.cache[require.resolve('ioredis')]!.exports.default = wrapRedis;

console.log('✅ Interceptação de conexões localhost ativada');
console.log('========================================');
console.log('🚀 [PRE-BOOT] Carregando aplicação...');
console.log('========================================');

// Agora sim, importar e executar o main
import('./main');
