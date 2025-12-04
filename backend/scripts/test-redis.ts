/**
 * Script de teste de conexão Redis
 * 
 * Uso:
 *   npx ts-node scripts/test-redis.ts
 * 
 * Ou após build:
 *   node dist/scripts/test-redis.js
 * 
 * Requer REDIS_URL definida no ambiente.
 */
import Redis from 'ioredis';

async function testRedis() {
  console.log('========================================');
  console.log('🔍 [TEST] Iniciando teste de conexão Redis');
  console.log('========================================');

  const url = process.env.REDIS_URL;
  
  if (!url) {
    console.error('❌ ERRO: variável REDIS_URL não definida');
    console.error('');
    console.error('📋 Defina REDIS_URL antes de executar:');
    console.error('   export REDIS_URL=redis://user:pass@host:port');
    console.error('');
    process.exit(1);
  }

  // Mask password for logging
  const maskedUrl = url.replace(/:[^:@]+@/, ':***@');
  console.log('🔑 Tentando conectar com Redis em:', maskedUrl);

  // Validate URL format
  if (url.includes('.railway.internal')) {
    console.error('❌ ERRO: URL contém .railway.internal (hostname interno)');
    console.error('📋 Use a URL PÚBLICA do Redis');
    process.exit(1);
  }

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    console.warn('⚠️  AVISO: URL aponta para localhost - isso não funciona em containers');
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 10000,
    retryStrategy(times) {
      if (times > 3) {
        console.error('❌ Máximo de tentativas atingido');
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', (err) => {
    console.error('❌ ioredis error event:', err.message);
  });

  redis.on('connect', () => {
    console.log('📡 Conectado ao Redis');
  });

  redis.on('ready', () => {
    console.log('✅ Redis pronto para comandos');
  });

  try {
    // Test PING
    const pong = await redis.ping();
    console.log('✅ PING:', pong);

    // Test SET
    await redis.set('__redis_connection_test__', 'OK', 'EX', 10);
    console.log('✅ SET: chave de teste criada');

    // Test GET
    const value = await redis.get('__redis_connection_test__');
    console.log('✅ GET: valor retornado =', value);

    // Test DEL
    await redis.del('__redis_connection_test__');
    console.log('✅ DEL: chave de teste removida');

    // Get server info
    const info = await redis.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    if (versionMatch) {
      console.log('📊 Redis version:', versionMatch[1]);
    }

    console.log('');
    console.log('========================================');
    console.log('🎉 Redis conectado e funcional!');
    console.log('========================================');

    await redis.quit();
    process.exit(0);
  } catch (err: any) {
    console.error('');
    console.error('========================================');
    console.error('❌ Erro durante operações de Redis:');
    console.error('========================================');
    console.error('Mensagem:', err.message);
    if (err.code) console.error('Código:', err.code);
    if (err.address) console.error('Endereço:', err.address);
    if (err.port) console.error('Porta:', err.port);
    console.error('');
    console.error('💡 Possíveis causas:');
    console.error('   - REDIS_URL inválida ou com credenciais erradas');
    console.error('   - Redis não está acessível (firewall, rede)');
    console.error('   - Usando hostname interno em ambiente externo');
    console.error('');

    try {
      await redis.quit();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

testRedis();
