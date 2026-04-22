import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import * as cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

const HTTPS_____KLOEL_FRONTEN_RE = /^https:\/\/kloel-frontend-.*\.vercel\.app$/;
const HTTPS_____KLOEL_ADMIN_RE = /^https:\/\/kloel-admin-.*\.vercel\.app$/;
const MAX_ORIGIN_PATTERN_LENGTH = 200;
const DATADOG_TRACING_HEADERS = [
  'traceparent',
  'tracestate',
  'baggage',
  'x-datadog-origin',
  'x-datadog-parent-id',
  'x-datadog-sampling-priority',
  'x-datadog-trace-id',
];

function matchesWildcardPattern(value: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return value === pattern;
  }

  const parts = pattern.split('*');
  let cursor = 0;

  if (!pattern.startsWith('*')) {
    const prefix = parts.shift() ?? '';
    if (!value.startsWith(prefix)) {
      return false;
    }
    cursor = prefix.length;
  }

  const suffix = pattern.endsWith('*') ? '' : (parts.pop() ?? '');

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const nextIndex = value.indexOf(part, cursor);
    if (nextIndex === -1) {
      return false;
    }
    cursor = nextIndex + part.length;
  }

  if (!suffix) {
    return true;
  }

  const suffixIndex = value.indexOf(suffix, cursor);
  return suffixIndex !== -1 && value.endsWith(suffix);
}

function normalizeCorsOriginPattern(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_ORIGIN_PATTERN_LENGTH) {
    console.warn('[CORS] Origin pattern too long, ignored (%d chars)', trimmed.length);
    return null;
  }

  const normalized = trimmed
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\\\./g, '.')
    .replace(/\.\*/g, '*');

  const isAllowedPattern = /^https?:\/\/[A-Za-z0-9.*:/_-]+$/.test(normalized);
  if (!isAllowedPattern) {
    console.warn('[CORS] Unsupported origin pattern ignored: %s', trimmed);
    return null;
  }

  return normalized;
}

function compileCorsOriginMatcher(raw: string): ((origin: string) => boolean) | null {
  const normalized = normalizeCorsOriginPattern(raw);
  if (!normalized) {
    return null;
  }
  return (origin: string) => matchesWildcardPattern(origin, normalized);
}

function handleSchemaError(schemaErr: unknown): void {
  const isSchemaMissing =
    schemaErr instanceof Prisma.PrismaClientKnownRequestError &&
    (schemaErr.code === 'P2021' || schemaErr.code === 'P2022');
  if (process.env.NODE_ENV === 'production') {
    if (isSchemaMissing) {
      console.error('[STARTUP] FATAL: schema not initialized (migrations not applied).');
    } else {
      console.error('[STARTUP] FATAL: schema validation failed.', schemaErr);
    }
    process.exit(1);
  }
  if (isSchemaMissing) {
    console.error('[STARTUP] Schema não inicializado (dev mode, continuando).');
  } else {
    console.error('[STARTUP] Falha ao validar schema (dev mode, continuando).', schemaErr);
  }
}

async function runStartupDbCheck(app: NestExpressApplication): Promise<void> {
  try {
    const prisma = app.get(PrismaService);
    await prisma.$queryRaw`SELECT 1`;
    console.log('[STARTUP] DB conectado');

    try {
      await prisma.workspace.count();
      console.log('[STARTUP] Schema OK');
    } catch (schemaErr: unknown) {
      handleSchemaError(schemaErr);
    }
  } catch (dbErr) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[STARTUP] FATAL: DB connection failed in production.', dbErr);
      process.exit(1);
    }
    console.error('[STARTUP] DB check failed (dev mode, continuando).', dbErr);
  }
}

function setupSwagger(app: NestExpressApplication): void {
  const swaggerUser = process.env.SWAGGER_BASIC_USER;
  const swaggerPass = process.env.SWAGGER_BASIC_PASS;
  const allowSwagger = process.env.NODE_ENV !== 'production' || (swaggerUser && swaggerPass);

  if (!allowSwagger) {
    console.warn(
      '[STARTUP] Swagger desabilitado em produção por falta de SWAGGER_BASIC_USER/PASS.',
    );
    return;
  }

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
}

async function bootstrap() {
  console.log('[BOOTSTRAP] Iniciando aplicação...');

  if (process.env.NODE_ENV === 'production' && process.env.AUTH_OPTIONAL === 'true') {
    throw new Error(
      'AUTH_OPTIONAL não pode estar habilitado em produção. Remova AUTH_OPTIONAL ou defina para false.',
    );
  }

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
  await runStartupDbCheck(app);

  // ============================================================
  // STARTUP BANNER (PR P3-5): log every integration's status so
  // operators can see at a glance what this instance can actually
  // do. Each line is "name: STATUS" where STATUS is CONFIGURED
  // (env var present) or DISABLED (env var absent). This is
  // operator visibility, not a gate — features that need a
  // missing integration will fail individually with a clearer
  // error than "why isn't anything working?".
  // ============================================================
  const integrationStatus = (key: string | string[]): 'CONFIGURED' | 'DISABLED' => {
    const keys = Array.isArray(key) ? key : [key];
    return keys.some((k) => !!process.env[k]) ? 'CONFIGURED' : 'DISABLED';
  };
  console.log('========================================');
  console.log('[STARTUP] Integrations:');
  console.log(`  Database (Postgres):       CONNECTED`);
  console.log(
    `  Redis:                     ${integrationStatus(['REDIS_URL', 'REDIS_HOST', 'REDISHOST'])}`,
  );
  console.log(
    `  WhatsApp provider default: ${process.env.WHATSAPP_PROVIDER_DEFAULT || 'meta-cloud'}`,
  );
  console.log(`  Stripe:                    ${integrationStatus('STRIPE_SECRET_KEY')}`);
  console.log(
    `  Meta (WhatsApp Business):  ${integrationStatus(['META_APP_ID', 'META_APP_SECRET'])}`,
  );
  console.log(`  OpenAI:                    ${integrationStatus('OPENAI_API_KEY')}`);
  console.log(`  Google OAuth:              ${integrationStatus('GOOGLE_CLIENT_ID')}`);
  console.log(`  Sentry:                    ${integrationStatus('SENTRY_DSN')}`);
  console.log(`  Frontend URL:              ${process.env.FRONTEND_URL || '(default)'}`);
  console.log(`  Node env:                  ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');

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
  const devMode = process.env.NODE_ENV !== 'production';
  const cspScriptSrc = ["'self'", "'unsafe-inline'"];
  const cspConnectSrc = ["'self'", 'https:', 'wss:'];
  if (devMode) {
    cspScriptSrc.push("'unsafe-eval'");
    cspConnectSrc.push('http:', 'ws:');
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: cspScriptSrc,
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: cspConnectSrc,
          fontSrc: ["'self'", 'https:', 'data:'],
          frameSrc: ["'self'"],
        },
      },
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
    'https://adm.kloel.com',
    'https://auth.kloel.com',
    'https://pay.kloel.com',
    'https://kloel-frontend.vercel.app',
    'https://kloel-admin.vercel.app',
    'https://kloel.vercel.app',
    'http://localhost:3000',
    'http://localhost:3005',
  ]);

  // Merge com origens extra via env var (CSV)
  const extraOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (extraOrigins) {
    for (const o of extraOrigins.split(',')) {
      const trimmed = o.trim();
      if (trimmed) {
        allowedOriginsExact.add(trimmed);
      }
    }
  }

  // Dynamic origin matchers for preview/staging domains. Env overrides accept
  // only a constrained wildcard syntax (`*`) or anchored regex-style strings
  // that normalize to the same wildcard form, so startup never compiles
  // arbitrary regular expressions from environment variables.
  const allowedOriginMatchers: Array<(origin: string) => boolean> = [
    (origin) => HTTPS_____KLOEL_FRONTEN_RE.test(origin),
    (origin) => HTTPS_____KLOEL_ADMIN_RE.test(origin),
  ];
  const extraRegex = process.env.CORS_ALLOWED_ORIGIN_REGEX;
  if (extraRegex) {
    for (const r of extraRegex.split(',')) {
      const matcher = compileCorsOriginMatcher(r);
      if (matcher) {
        allowedOriginMatchers.push(matcher);
      }
    }
  }

  /**
   * SECURITY: CORS origin validation against an allowlist.
   * Returns the matched origin string from the allowlist (not the raw header)
   * to prevent header injection. Returns null if not allowed.
   */
  function matchAllowedOrigin(origin: string | undefined): string | null {
    // Requests without Origin header are not browser CORS requests.
    // This includes webhooks, health checks, internal polling, and server-to-server traffic.
    if (!origin) {
      return null;
    }
    if (allowedOriginsExact.has(origin)) {
      return origin;
    }
    for (const matcher of allowedOriginMatchers) {
      if (matcher(origin)) {
        return origin;
      }
    }
    // In dev, accept any origin
    if (process.env.NODE_ENV !== 'production') {
      return origin;
    }
    return null;
  }

  // CORS middleware for ALL responses (including SSE).
  // NestJS enableCors does not cover routes that use @Res().
  const applyCorsOriginHeader = (req: Request, res: Response): boolean => {
    const rawOrigin = req.headers.origin;
    if (!rawOrigin) {
      return true;
    }
    const matched = matchAllowedOrigin(rawOrigin);
    if (matched) {
      res.setHeader('Access-Control-Allow-Origin', matched);
      return true;
    }
    console.warn('[CORS] Blocked origin: %s on %s %s', rawOrigin, req.method, req.path);
    return req.method !== 'OPTIONS';
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowed = applyCorsOriginHeader(req, res);
    if (!allowed) {
      return res.status(403).end();
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      [
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin',
        'User-Agent',
        'Cache-Control',
        'Pragma',
        'X-Session-Id',
        'x-workspace-id',
        'X-Requested-With',
        ...DATADOG_TRACING_HEADERS,
      ].join(', '),
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
      cb(null, matchAllowedOrigin(origin) !== null || !origin);
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
      'x-workspace-id',
      'X-Requested-With',
      ...DATADOG_TRACING_HEADERS,
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

  // Swagger Documentation (desabilita em produção se não houver basic auth configurado)
  setupSwagger(app);

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Nest application successfully started on port ${port}`);
}

void bootstrap();
