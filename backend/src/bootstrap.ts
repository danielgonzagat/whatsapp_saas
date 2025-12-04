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

// Validar REDIS_URL
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('');
  console.error('❌ ============================================');
  console.error('❌ [FATAL] REDIS_URL não está definida!');
  console.error('❌ ============================================');
  console.error('');
  console.error('📋 Para corrigir, defina REDIS_URL no Railway:');
  console.error('   REDIS_URL=redis://default:SENHA@redis-xxxxx.railway.app:6379');
  console.error('');
  console.error('⚠️  Use a URL PÚBLICA do Redis (não .railway.internal)');
  console.error('');
  process.exit(1);
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
console.log('');
console.log('========================================');
console.log('🚀 [PRE-BOOT] Carregando aplicação...');
console.log('========================================');

// Agora sim, importar e executar o main
import('./main');
