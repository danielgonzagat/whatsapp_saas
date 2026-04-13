/**
 * Script para testar a conexão com o Redis.
 *
 * Execute com: npx ts-node backend/scripts/test-redis.ts
 *
 * Este script mostra qual URL está sendo resolvida e tenta conectar.
 * Em produção no Railway, o backend e o worker devem usar REDIS_URL
 * interno (.railway.internal) ou variáveis de componentes equivalentes.
 * REDIS_PUBLIC_URL/proxy público não é aceitável como caminho padrão
 * do backend/worker.
 */

console.log('========================================');
console.log('🔍 TESTE DE CONEXÃO REDIS');
console.log('========================================');
console.log('');

// Mostrar todas as variáveis REDIS
console.log('📋 Variáveis de ambiente REDIS:');
const redisVars = Object.keys(process.env).filter((k) => k.toUpperCase().includes('REDIS'));
if (redisVars.length === 0) {
  console.log('   ❌ Nenhuma variável REDIS encontrada!');
} else {
  redisVars.forEach((k) => {
    const value = process.env[k] || '';
    const masked = value.replace(/:[^:@]+@/, ':***@');
    const isInternal = value.includes('.railway.internal');
    const isPublicProxy =
      value.includes('mainline.proxy.rlwy.net') || value.includes('proxy.rlwy.net');
    const icon = isInternal ? '✅ ' : isPublicProxy ? '⚠️ ' : '• ';
    console.log(`   ${icon}${k}: ${masked.substring(0, 70)}`);
    if (isInternal) {
      console.log(
        '      ↳ Host interno do Railway: este é o caminho esperado para backend/worker no deploy.',
      );
    }
    if (isPublicProxy) {
      console.log(
        '      ↳ URL pública/proxy detectada: não deve ser o caminho padrão do backend/worker.',
      );
    }
  });
}
console.log('');

// Testar a resolução da URL
import { resolveRedisUrl, maskRedisUrl } from '../src/common/redis/redis.util';

console.log('🔧 Testando resolveRedisUrl()...');
try {
  const url = resolveRedisUrl();
  if (!url) {
    console.log('   Redis desabilitado pela configuração atual (resolveRedisUrl() retornou null).');
    process.exit(0);
  }
  console.log('   URL resolvida:', maskRedisUrl(url));

  if (url.includes('.railway.internal')) {
    console.log('');
    console.log('   ✅ A URL resolvida usa a rede interna do Railway.');
    console.log('   ✅ Este é o formato correto para backend/worker rodando no mesmo projeto.');
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
    console.log('   1. O teste foi executado fora da rede privada do Railway');
    console.log('   2. A senha está incorreta');
    console.log('   3. O serviço Redis não está rodando');
    console.log('');
    console.log('   📋 Em produção, backend/worker devem usar REDIS_URL interno.');
    console.log(
      '   📋 Para depurar localmente fora do Railway, teste a partir do runtime/deploy ou use um Redis local.',
    );
    console.log('');
    process.exit(1);
  }, 15000);
} catch (err: any) {
  console.log('   ❌ Erro ao resolver URL:', err.message);
  console.log('');
  console.log('   📋 Configure uma das variáveis:');
  console.log('      REDIS_URL=redis://...');
  console.log('      REDIS_FALLBACK_URL=redis://...');
  console.log('      REDIS_HOST + REDIS_PORT + REDIS_PASSWORD');
  process.exit(1);
}
