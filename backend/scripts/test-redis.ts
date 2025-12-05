/**
 * Script para testar a conexão com o Redis
 * 
 * Execute com: npx ts-node backend/scripts/test-redis.ts
 * 
 * Este script mostra qual URL está sendo resolvida e tenta conectar.
 */

console.log('========================================');
console.log('🔍 TESTE DE CONEXÃO REDIS');
console.log('========================================');
console.log('');

// Mostrar todas as variáveis REDIS
console.log('📋 Variáveis de ambiente REDIS:');
const redisVars = Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS'));
if (redisVars.length === 0) {
  console.log('   ❌ Nenhuma variável REDIS encontrada!');
} else {
  redisVars.forEach(k => {
    const value = process.env[k] || '';
    const masked = value.replace(/:[^:@]+@/, ':***@');
    const isInternal = value.includes('.railway.internal');
    const icon = isInternal ? '⚠️ ' : '✅ ';
    console.log(`   ${icon}${k}: ${masked.substring(0, 70)}`);
    if (isInternal) {
      console.log('      ↳ ATENÇÃO: Este é um host interno do Railway!');
    }
  });
}
console.log('');

// Testar a resolução da URL
import { resolveRedisUrl, maskRedisUrl } from '../src/common/redis/redis.util';

console.log('🔧 Testando resolveRedisUrl()...');
try {
  const url = resolveRedisUrl();
  console.log('   URL resolvida:', maskRedisUrl(url));
  
  if (url.includes('.railway.internal')) {
    console.log('');
    console.log('   ⚠️  ATENÇÃO: A URL resolvida contém .railway.internal');
    console.log('   ⚠️  Isso só funciona se o backend está na mesma rede do Redis');
    console.log('');
    console.log('   📋 Para usar a URL pública, defina:');
    console.log('      REDIS_PUBLIC_URL=redis://default:<senha>@<host-publico>:<porta>');
  }
  
  console.log('');
  console.log('🔌 Tentando conectar ao Redis...');
  
  const Redis = require('ioredis');
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    retryStrategy(times: number) {
      if (times > 3) return null;
      return Math.min(times * 1000, 3000);
    },
  });
  
  client.on('error', (err: Error) => {
    console.log('   ❌ Erro:', err.message);
  });
  
  client.on('ready', async () => {
    console.log('   ✅ Conexão estabelecida com sucesso!');
    
    // Testar ping
    try {
      const pong = await client.ping();
      console.log('   ✅ PING:', pong);
    } catch (err: any) {
      console.log('   ❌ PING falhou:', err.message);
    }
    
    // Fechar conexão
    await client.quit();
    console.log('');
    console.log('========================================');
    console.log('✅ TESTE CONCLUÍDO COM SUCESSO');
    console.log('========================================');
    process.exit(0);
  });
  
  // Timeout
  setTimeout(() => {
    console.log('');
    console.log('   ❌ Timeout: Não foi possível conectar em 15 segundos');
    console.log('');
    console.log('   Possíveis causas:');
    console.log('   1. O host redis.railway.internal não é acessível desta rede');
    console.log('   2. A senha está incorreta');
    console.log('   3. O serviço Redis não está rodando');
    console.log('');
    console.log('   📋 Solução: Configure REDIS_PUBLIC_URL ou REDIS_URL com a URL pública');
    console.log('');
    process.exit(1);
  }, 15000);
  
} catch (err: any) {
  console.log('   ❌ Erro ao resolver URL:', err.message);
  console.log('');
  console.log('   📋 Configure uma das variáveis:');
  console.log('      REDIS_PUBLIC_URL=redis://...');
  console.log('      REDIS_URL=redis://...');
  console.log('      REDIS_HOST + REDIS_PORT + REDIS_PASSWORD');
  process.exit(1);
}
