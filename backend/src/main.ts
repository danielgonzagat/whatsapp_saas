import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SentryExceptionFilter } from './sentry.filter';
import { initSentry } from './sentry';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { FunnelsService } from './funnels/funnels.service';
import helmet from 'helmet';
import { PrismaService } from './prisma/prisma.service';
import { Prisma } from '@prisma/client';

async function bootstrap() {
  console.log('🚀 [BOOTSTRAP] Iniciando aplicação...');

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.AUTH_OPTIONAL === 'true'
  ) {
    throw new Error(
      'AUTH_OPTIONAL não pode estar habilitado em produção. Remova AUTH_OPTIONAL ou defina para false.',
    );
  }

  // Observabilidade (Sentry)
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // ============================================================
  // STARTUP CHECK: DB conectado + schema OK
  // (não derruba o serviço; apenas loga claramente)
  // ============================================================
  try {
    const prisma = app.get(PrismaService);
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ [STARTUP] DB conectado');

    try {
      await prisma.workspace.count();
      console.log('✅ [STARTUP] Schema OK');
    } catch (schemaErr: any) {
      const isSchemaMissing =
        schemaErr instanceof Prisma.PrismaClientKnownRequestError &&
        (schemaErr.code === 'P2021' || schemaErr.code === 'P2022');
      if (isSchemaMissing) {
        console.error(
          '⚠️ [STARTUP] Schema não inicializado (migrations não aplicadas).',
        );
      } else {
        console.error('⚠️ [STARTUP] Falha ao validar schema.', schemaErr);
      }
    }
  } catch (dbErr) {
    console.error('⚠️ [STARTUP] Falha ao conectar no DB.', dbErr);
  }

  // Headers de segurança (CSP off para evitar break em Swagger/iframes; reforçamos demais diretivas)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
      xssFilter: true,
      hidePoweredBy: true,
    }),
  );
  app.disable('x-powered-by');

  // ============================================================
  // CORS PREFLIGHT HANDLER - Handler manual apenas para OPTIONS
  // (para garantir que preflight funcione corretamente)
  // O resto é tratado pelo app.enableCors() abaixo
  // ============================================================
  const allowedOrigins = [
    'https://kloel.com',
    'https://www.kloel.com',
    'https://kloel-frontend.vercel.app',
    'https://kloel.vercel.app',
    'http://localhost:3000',
    'http://localhost:3005',
  ];

  // Middleware para setar CORS em TODAS as respostas (incluindo SSE)
  // O NestJS enableCors não cobre rotas que usam @Res()
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    // Em produção: só habilita CORS para origens allowlisted (não refletir origem arbitrária)
    // Em dev: mantém flexível para facilitar testes locais.
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin && process.env.NODE_ENV !== 'production') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, User-Agent, Cache-Control, Pragma, X-Session-Id, x-workspace-id');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');

    // Responder imediatamente a requisições OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Serve Static Files (Audio/Images) from 'backend/public' mapped to root
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
  });

  // Serve uploaded documents from 'backend/uploads' mapped to /uploads
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // CORS global - origens permitidas (produção + dev)
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'User-Agent',
      'Cache-Control',
      'Pragma',
      'X-Session-Id',
      'x-workspace-id',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Validação Global (DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Shutdown graceful para Prisma/Redis
  app.enableShutdownHooks();

  // Registrar WhatsappService globalmente (para workers legacy)
  try {
    const whatsappService = app.get(WhatsappService);
    (global as any).whatsappService = whatsappService;
    console.log('✔ WhatsappService registrado globalmente.');
  } catch (err) {
    console.error('❌ ERRO ao registrar WhatsappService:', err);
  }

  // Registrar FunnelsService globalmente
  try {
    const funnelsService = app.get(FunnelsService);
    (global as any).funnelsService = funnelsService;
    console.log('✔ FunnelsService registrado globalmente.');
  } catch (err) {
    console.warn(
      '⚠ FunnelsService não encontrado (OK se não implementado ainda).',
      err,
    );
  }

  // Registrar filtro global (erro → Sentry)
  try {
    const adapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryExceptionFilter(adapterHost));
  } catch (err) {
    console.warn('⚠ Não foi possível registrar filtro Sentry:', err);
  }

  // Swagger Documentation (desabilita em produção se não houver basic auth configurado)
  const swaggerUser = process.env.SWAGGER_BASIC_USER;
  const swaggerPass = process.env.SWAGGER_BASIC_PASS;
  const allowSwagger =
    process.env.NODE_ENV !== 'production' || (swaggerUser && swaggerPass);

  if (allowSwagger) {
    if (swaggerUser && swaggerPass) {
      app.use(['/api', '/api-json'], (req, res, next) => {
        const header = req.headers.authorization || '';
        const expected = Buffer.from(`\${swaggerUser}:\${swaggerPass}`).toString(
          'base64',
        );
        if (header !== `Basic \${expected}`) {
          res.set('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Authentication required for Swagger');
        }
        return next();
      });
    }

    const config = new DocumentBuilder()
      .setTitle('WhatsApp SaaS API')
      .setDescription('The core API for the SaaS platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  } else {
    console.warn(
      '⚠️ Swagger desabilitado em produção por falta de SWAGGER_BASIC_USER/PASS.',
    );
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Nest application successfully started on port \${port}`);
}

void bootstrap();
