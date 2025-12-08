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

  // Serve Static Files (Audio/Images) from 'backend/public' mapped to root
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/',
  });

  // CORS global
  const corsEnv =
    process.env.CORS_ORIGIN ||
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL;
  const allowedOrigins = corsEnv
    ? corsEnv
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  if (allowedOrigins.length === 0) {
    console.warn(
      '⚠️ CORS liberado para qualquer origem. Defina CORS_ORIGIN/ALLOWED_ORIGINS para restringir.',
    );
  }

  app.enableCors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: 'GET,POST,PUT,PATCH,DELETE,HEAD',
    credentials: true,
  });

  // Validação Global (DTOs)
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

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
        const expected = Buffer.from(`${swaggerUser}:${swaggerPass}`).toString(
          'base64',
        );
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
    console.warn(
      '⚠️ Swagger desabilitado em produção por falta de SWAGGER_BASIC_USER/PASS.',
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Nest application successfully started on port ${port}`);
}

void bootstrap();
