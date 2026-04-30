import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkCostLimits } from '../parsers/cost-limit-checker';
import { checkE2eWhatsapp } from '../parsers/e2e-whatsapp';
import { checkMonitoringCoverage } from '../parsers/monitoring-coverage';
import { checkObservability } from '../parsers/observability-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-parser-dynamic-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

async function withDeepEnv<T>(run: () => Promise<T>): Promise<T> {
  const previousDeep = process.env.PULSE_DEEP;
  const previousRailwayVars = process.env.PULSE_RAILWAY_VARS_JSON;
  const previousBackendUrl = process.env.PULSE_BACKEND_URL;
  process.env.PULSE_DEEP = '1';
  process.env.PULSE_RAILWAY_VARS_JSON = '{}';
  process.env.PULSE_BACKEND_URL = '';
  try {
    return await run();
  } finally {
    process.env.PULSE_DEEP = previousDeep;
    process.env.PULSE_RAILWAY_VARS_JSON = previousRailwayVars;
    process.env.PULSE_BACKEND_URL = previousBackendUrl;
  }
}

describe('parser dynamic evidence contracts', () => {
  it('uses structural business side effects for monitoring instead of product/provider names', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/stripe-label.service.ts',
      `
      export class StripeLabelService {
        readLabel() { return 'provider-name-only'; }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque-side-effect.service.ts',
      `
      export class OpaqueSideEffectService {
        async mutate() {
          return this.prisma.opaqueLedger.create({
            data: { amountCents: 1200, currency: 'BRL', status: 'OPEN' },
          });
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/health.controller.ts',
      `
      import { Controller, Get } from '@nestjs/common';
      @Controller('health')
      export class HealthController { @Get() get() { return { status: 'ok' }; } }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/ops-alert.service.ts',
      'export class OpsAlertService { alertOnCriticalError(err: unknown) { return err; } }',
    );
    writeFile(
      config.rootDir,
      'backend/src/metrics.service.ts',
      'export class MetricsService { histogram(name: string, value: number) { return { name, value }; } }',
    );
    writeFile(
      config.rootDir,
      'worker/queue-health.ts',
      'export const queueHealth = { failedJobCount: 0, queueDepth: 0 };',
    );

    const breaks = checkMonitoringCoverage(config);

    expect(breaks.some((entry) => entry.file.endsWith('stripe-label.service.ts'))).toBe(false);
    expect(
      breaks.some(
        (entry) =>
          entry.file.endsWith('opaque-side-effect.service.ts') &&
          entry.description.includes('Business-critical mutating service'),
      ),
    ).toBe(true);
  });

  it('keeps production observability integrations as valid structural evidence', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/health.controller.ts',
      'export class HealthController { @Get("health") get() { return { status: "ok" }; } }',
    );
    writeFile(
      config.rootDir,
      'backend/src/request-id.middleware.ts',
      'export class RequestIdMiddleware { use(req: { requestId?: string }) { req.requestId = "id"; } }',
    );
    writeFile(
      config.rootDir,
      'backend/src/monitoring.ts',
      [
        "import * as Sentry from '@sentry/node';",
        "import '@datadog/browser-rum';",
        "import client from 'prom-client';",
        "import pino from 'pino';",
        'Sentry.captureException(new Error("boom"));',
        'client.register.metrics();',
        'pino().info({ event: "ready", workspaceId: "workspace" });',
      ].join('\n'),
    );
    writeFile(
      config.rootDir,
      'frontend/src/instrumentation.ts',
      [
        "import * as Sentry from '@sentry/nextjs';",
        'Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN });',
      ].join('\n'),
    );
    writeFile(
      config.rootDir,
      'worker/queue-health.ts',
      'export const queueHealth = { failedJobCount: 0, queueDepth: 0 };',
    );

    const monitoringBreaks = checkMonitoringCoverage(config);
    const observabilityBreaks = checkObservability(config);

    expect(monitoringBreaks).not.toContainEqual(
      expect.objectContaining({ description: 'No backend error alerting sink found' }),
    );
    expect(monitoringBreaks).not.toContainEqual(
      expect.objectContaining({ description: 'No frontend error alerting sink found' }),
    );
    expect(monitoringBreaks).not.toContainEqual(
      expect.objectContaining({ description: 'No metrics emission evidence found' }),
    );
    expect(observabilityBreaks).not.toContainEqual(
      expect.objectContaining({
        description: 'No error alerting integration found — critical errors will go unnoticed',
      }),
    );
    expect(observabilityBreaks).not.toContainEqual(
      expect.objectContaining({
        description:
          'No metrics collection found — cannot monitor request latency, error rate, or queue depth',
      }),
    );
  });

  it('keeps WhatsApp cost guard evidence while ignoring fixture senders', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/whatsapp/whatsapp.fixtures.ts',
      'export const fixtureSender = { sendMessage() { return undefined; } };',
    );
    writeFile(
      config.rootDir,
      'backend/src/whatsapp/guarded.service.ts',
      `
      export class GuardedWhatsappService {
        async send(workspaceId: string) {
          await this.ensureDailyMessageQuota(workspaceId);
          return this.provider.sendMessage(workspaceId);
        }
      }
      `,
    );

    const whatsappCostBreaks = checkCostLimits(config).filter((entry) =>
      entry.description.includes('WhatsApp messages sent without per-workspace daily rate limit'),
    );

    expect(whatsappCostBreaks).toEqual([]);
  });

  it('requires tracing on outbound calls by call shape, not provider allowlists', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/opaque-traced.service.ts',
      `
      import { getTraceHeaders } from './trace';
      export class OpaqueTracedService {
        async send() {
          return fetch('https://opaque.example.test/event', { headers: getTraceHeaders() });
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque-untraced.service.ts',
      `
      export class OpaqueUntracedService {
        async send() {
          return fetch('https://opaque.example.test/event');
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/request-id.middleware.ts',
      'export class RequestIdMiddleware { use(req: { correlationId?: string }) { req.correlationId = "id"; } }',
    );
    writeFile(
      config.rootDir,
      'backend/src/ops-alert.service.ts',
      'export class OpsAlertService { captureException(err: unknown) { return err; } }',
    );
    writeFile(
      config.rootDir,
      'backend/src/metrics.service.ts',
      'export class MetricsService { counter = { inc() { return undefined; } }; }',
    );
    writeFile(
      config.rootDir,
      'backend/src/health.controller.ts',
      '@Controller("health") export class HealthController {}',
    );

    const tracingBreaks = checkObservability(config).filter(
      (entry) =>
        entry.type.includes('correlation-propagation-not-observed') ||
        entry.surface === 'observability-tracing',
    );

    expect(tracingBreaks.some((entry) => entry.file.endsWith('opaque-traced.service.ts'))).toBe(
      false,
    );
    expect(tracingBreaks.some((entry) => entry.file.endsWith('opaque-untraced.service.ts'))).toBe(
      true,
    );
  });

  it('discovers AI config wiring from Prisma relations and prompt consumers', async () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/prisma/schema.prisma',
      `
      model Sellable {
        id String @id
        active Boolean @default(true)
        configs OpaqueConfig[]
        plans OpaquePlan[]
      }
      model OpaqueConfig {
        id String @id
        sellableId String
        sellable Sellable @relation(fields: [sellableId], references: [id])
        behavior Json?
        promptRules Json?
      }
      model OpaquePlan {
        id String @id
        sellableId String
        sellable Sellable @relation(fields: [sellableId], references: [id])
        price Float
        currency String
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque-agent.service.ts',
      `
      export class OpaqueAgentService {
        async reply() {
          const configs = await this.prisma.opaqueConfig.findMany();
          const systemPrompt = this.buildSystemPrompt(configs);
          return [{ role: 'system', content: systemPrompt }];
        }
        buildSystemPrompt(configs: unknown[]) { return JSON.stringify(configs); }
      }
      `,
    );

    await expect(withDeepEnv(() => checkE2eWhatsapp(config))).resolves.not.toContainEqual(
      expect.objectContaining({
        description: 'No prompt-building agent code consumes discovered config models',
      }),
    );
  });

  it('requires active autonomous executors to have compatible persisted config context', async () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/prisma/schema.prisma',
      `model Workspace {
  id String @id
  responders OpaqueResponder[]
}
model OpaqueResponder {
  id String @id
  enabled Boolean @default(true)
  workspaceId String
  workspace Workspace @relation(fields: [workspaceId], references: [id])
}
model Sellable {
  id String @id
  active Boolean @default(true)
  configs OpaqueConfig[]
}
model OpaqueConfig {
  id String @id
  sellableId String
  sellable Sellable @relation(fields: [sellableId], references: [id])
  behavior Json?
  promptRules Json?
}
`,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque-agent.service.ts',
      `
      export class OpaqueAgentService {
        async reply() {
          const configs = await this.prisma.opaqueConfig.findMany();
          const systemPrompt = this.buildSystemPrompt(configs);
          return [{ role: 'system', content: systemPrompt }];
        }
        buildSystemPrompt(configs: unknown[]) { return JSON.stringify(configs); }
      }
      `,
    );

    const breaks = await withDeepEnv(() => checkE2eWhatsapp(config));

    expect(breaks).toContainEqual(
      expect.objectContaining({
        description:
          'Active autonomous model OpaqueResponder has no compatible persisted config/context relation',
      }),
    );
  });
});
