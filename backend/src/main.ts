import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SentryExceptionFilter } from './sentry.filter';
import { initSentry } from './sentry';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { PrismaService } from './prisma/prisma.service';
import { Prisma } from '@prisma/client';

async function bootstrap() {
  console.log('🚀 [BOOTSTRAP] Iniciando aplicação...');

  if (process.env.NODE_ENV === 'production' && process.env.AUTH_OPTIONAL === 'true') {
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
  // STARTUP CHECK: DB conectado + schema OK (invariant I5)
  //
  // In production, a missing DB or uninitialized schema is a hard failure.
  // process.exit(1) ensures the orchestrator (Railway/Docker) detects
  // startup failure and does not route traffic to this instance. In
  // development we log and continue so devs can fix migrations interactively.
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
      if (process.env.NODE_ENV === 'production') {
        if (isSchemaMissing) {
          console.error('❌ [STARTUP] FATAL: schema not initialized (migrations not applied).');
        } else {
          console.error('❌ [STARTUP] FATAL: schema validation failed.', schemaErr);
        }
        process.exit(1);
      }
      if (isSchemaMissing) {
        console.error('⚠️ [STARTUP] Schema não inicializado (dev mode, continuando).');
      } else {
        console.error('⚠️ [STARTUP] Falha ao validar schema (dev mode, continuando).', schemaErr);
      }
    }
  } catch (dbErr) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ [STARTUP] FATAL: DB connection failed in production.', dbErr);
      process.exit(1);
    }
    console.error('⚠️ [STARTUP] DB check failed (dev mode, continuando).', dbErr);
  }

  // Cookie parser for httpOnly JWT tokens
  app.use(cookieParser());

  // CSRF mitigation strategy:
  // This API is JWT-based (Authorization: Bearer header), not cookie-only.
  // JWTs in Authorization headers are immune to CSRF by definition (browsers cannot
  // set custom headers on cross-origin form submissions). Additionally:
  //   - SameSite=Lax cookies are set for refresh tokens (prevents cross-site sends)
  //   - X-Requested-With: XMLHttpRequest header is enforced by the frontend apiFetch
  //   - CORS is restricted to known origins (allowedOriginsExact list above)
  // Traditional CSRF tokens (csurf/csrfProtection) are therefore unnecessary.
  // PULSE:ACCEPTED_RISK CSRF — JWT+SameSite+X-Requested-With provides equivalent mitigation

  // Headers de segurança (CSP off para evitar break em Swagger/iframes; reforçamos demais diretivas)
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https:', 'wss:'],
                fontSrc: ["'self'", 'https:', 'data:'],
                frameSrc: ["'self'"],
              },
            }
          : false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
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
  const allowedOriginsExact = new Set([
    'https://kloel.com',
    'https://www.kloel.com',
    'https://app.kloel.com',
    'https://auth.kloel.com',
    'https://pay.kloel.com',
    'https://kloel-frontend.vercel.app',
    'https://kloel.vercel.app',
    'http://localhost:3000',
    'http://localhost:3005',
  ]);

  // Merge com origens extra via env var (CSV)
  const extraOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (extraOrigins) {
    for (const o of extraOrigins.split(',')) {
      const trimmed = o.trim();
      if (trimmed) allowedOriginsExact.add(trimmed);
    }
  }

  // Regex patterns para origens dinâmicas (ex: Vercel preview deploys)
  const allowedOriginsRegex: RegExp[] = [/^https:\/\/kloel-frontend-.*\.vercel\.app$/];
  const extraRegex = process.env.CORS_ALLOWED_ORIGIN_REGEX;
  if (extraRegex) {
    for (const r of extraRegex.split(',')) {
      const trimmed = r.trim();
      if (trimmed) {
        try {
          allowedOriginsRegex.push(new RegExp(trimmed));
        } catch {
          console.warn(`[CORS] Invalid regex pattern ignored: ${trimmed}`);
        }
      }
    }
  }

  function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return process.env.NODE_ENV !== 'production'; // server-to-server, sem header Origin
    if (allowedOriginsExact.has(origin)) return true;
    for (const re of allowedOriginsRegex) {
      if (re.test(origin)) return true;
    }
    // Em dev, aceitar qualquer origin
    if (process.env.NODE_ENV !== 'production') return true;
    return false;
  }

  // Middleware para setar CORS em TODAS as respostas (incluindo SSE)
  // O NestJS enableCors não cobre rotas que usam @Res()
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } else {
      // Origin não permitido em produção — loga e bloqueia preflight
      console.warn(`[CORS] Blocked origin: ${origin} on ${req.method} ${req.path}`);
      if (req.method === 'OPTIONS') {
        return res.status(403).end();
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, Origin, User-Agent, Cache-Control, Pragma, X-Session-Id, X-Meli-Session-Id, x-meli-session-id, x-workspace-id, X-Requested-With',
    );
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

  // CORS global - origens permitidas (produção + dev)
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      cb(null, isAllowedOrigin(origin));
    },
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
      'X-Meli-Session-Id',
      'x-meli-session-id',
      'x-workspace-id',
      'X-Requested-With',
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

  // Registrar filtro global (erro → Sentry)
  try {
    const adapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryExceptionFilter(adapterHost));
  } catch (err) {
    // PULSE:OK — Sentry filter registration is non-critical; app still serves requests
    console.warn('⚠ Não foi possível registrar filtro Sentry:', err);
  }

  // Swagger Documentation (desabilita em produção se não houver basic auth configurado)
  const swaggerUser = process.env.SWAGGER_BASIC_USER;
  const swaggerPass = process.env.SWAGGER_BASIC_PASS;
  const allowSwagger = process.env.NODE_ENV !== 'production' || (swaggerUser && swaggerPass);

  if (allowSwagger) {
    if (swaggerUser && swaggerPass) {
      app.use(['/api', '/api-json'], (req, res, next) => {
        const header = req.headers.authorization || '';
        const expected = Buffer.from(`${swaggerUser}:${swaggerPass}`).toString('base64');
        if (header !== `Basic ${expected}`) {
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
    console.warn('⚠️ Swagger desabilitado em produção por falta de SWAGGER_BASIC_USER/PASS.');
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Nest application successfully started on port ${port}`);
}

void bootstrap();
