/**
 * Bootstrap - Validação de ambiente ANTES de carregar qualquer módulo
 * 
 * Este arquivo é o entry point real da aplicação.
 * Ele valida as variáveis de ambiente ANTES de importar qualquer coisa.
 */

console.log('========================================');
console.log('🔍 [PRE-BOOT] Verificando variáveis de ambiente...');
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
  console.log(`   ${k}: ${safeValue}`);
});

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

let redisUrl: string | undefined = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn('⚠️  [PRE-BOOT] REDIS_URL não definida, tentando REDIS_HOST/PORT...');
  redisUrl = buildRedisUrlFromComponents();
  
  if (redisUrl) {
    const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':***@');
    console.warn('⚠️  [PRE-BOOT] URL construída de REDIS_HOST/PORT:', maskedUrl);
    // Exportar para uso por outros módulos
    process.env.REDIS_URL = redisUrl;
  } else {
    console.error('');
    console.error('❌ ============================================');
    console.error('❌ [FATAL] REDIS_URL e REDIS_HOST não definidas!');
    console.error('❌ ============================================');
    console.error('');
    console.error('📋 Configure REDIS_URL ou REDIS_HOST/REDIS_PORT:');
    console.error('   REDIS_URL=redis://default:SENHA@host:port');
    console.error('   ou');
    console.error('   REDIS_HOST=host REDIS_PORT=port REDIS_PASSWORD=senha');
    console.error('');
    process.exit(1);
  }
}

if (redisUrl.includes('.railway.internal') || redisUrl.includes('redis.railway.internal')) {
  console.error('');
  console.error('❌ ============================================');
  console.error('❌ [FATAL] REDIS_URL usando hostname INTERNO!');
  console.error('❌ ============================================');
  console.error('');
  console.error('🔴 Valor atual:', redisUrl.replace(/:[^:@]+@/, ':***@'));
  console.error('');
  console.error('📋 O Railway está injetando o hostname interno.');
  console.error('   Você precisa SOBRESCREVER a variável REDIS_URL');
  console.error('   com a URL PÚBLICA do Redis.');
  console.error('');
  console.error('✅ Exemplo correto:');
  console.error('   redis://default:SENHA@redis-production-xxxx.railway.app:6379');
  console.error('');
  console.error('⚠️  Vá no Railway → Redis → Connect → Public URL');
  console.error('');
  process.exit(1);
}

console.log('');
console.log('✅ [PRE-BOOT] REDIS_URL válida!');
console.log('✅ [PRE-BOOT] Host:', new URL(redisUrl).hostname);
console.log('✅ [PRE-BOOT] Port:', new URL(redisUrl).port || '6379');
console.log('');

// ========== INTERCEPTAR CONEXÕES LOCALHOST ==========
const originalRedisConstructor = require('ioredis');
const wrapRedis = function(...args: any[]) {
  const firstArg = args[0];
  
  // Detectar se está tentando usar localhost
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
    console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
    console.error('🚨 LOCALHOST REDIS DETECTADO! 🚨');
    console.error('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
    console.error('');
    console.error('Motivo:', reason);
    console.error('Argumentos:', JSON.stringify(args, null, 2));
    console.error('');
    console.error('Stack trace:');
    console.error(new Error().stack);
    console.error('');
    console.error('🔧 FORÇANDO USO DE REDIS_URL:', redisUrl?.substring(0, 50) + '...');
    console.error('');
    
    // Forçar uso do REDIS_URL correto
    return new originalRedisConstructor(redisUrl);
  }
  
  // Log normal para conexões válidas
  console.log('');
  console.log('🔍 [REDIS-TRACE] Nova conexão Redis:');
  if (typeof firstArg === 'string') {
    console.log('   URL:', firstArg.replace(/:[^:@]+@/, ':***@').substring(0, 60));
  } else if (firstArg && typeof firstArg === 'object') {
    console.log('   Host:', firstArg.host, 'Port:', firstArg.port);
  }
  console.log('');
  
  return new originalRedisConstructor(...args);
};

// Copiar propriedades estáticas
wrapRedis.Cluster = originalRedisConstructor.Cluster;
wrapRedis.Command = originalRedisConstructor.Command;
Object.setPrototypeOf(wrapRedis, originalRedisConstructor);

// Substituir no cache de módulos
require.cache[require.resolve('ioredis')]!.exports = wrapRedis;
require.cache[require.resolve('ioredis')]!.exports.default = wrapRedis;

console.log('✅ Interceptação de Redis localhost ativada');
console.log('========================================');
console.log('🚀 [PRE-BOOT] Carregando aplicação...');
console.log('========================================');

// Agora sim, importar e executar o main
import('./main');
