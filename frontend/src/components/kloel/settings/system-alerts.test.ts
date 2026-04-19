import { describe, expect, it } from 'vitest';

import {
  deriveSystemAlerts,
  type SystemHealthSnapshot,
  summarizeSystemHealth,
} from './system-alerts';

describe('deriveSystemAlerts', () => {
  it('returns a single success alert when all critical dependencies are healthy', () => {
    const snapshot: SystemHealthSnapshot = {
      status: 'UP',
      details: {
        database: { status: 'UP' },
        redis: { status: 'UP' },
        whatsapp: { status: 'UP', connectedWorkspaces: 2 },
        worker: { status: 'UP' },
        storage: { status: 'UP', driver: 'r2' },
        config: { status: 'CONFIGURED', missing: [] },
        openai: { status: 'CONFIGURED' },
        anthropic: { status: 'CONFIGURED' },
        stripe: { status: 'CONFIGURED' },
        googleAuth: { status: 'CONFIGURED' },
        timestamp: '2026-04-18T16:20:00.000Z',
      },
    };

    expect(deriveSystemAlerts(snapshot)).toEqual([
      expect.objectContaining({
        type: 'success',
        message: 'Todos os serviços críticos estão operacionais.',
      }),
    ]);
  });

  it('elevates down dependencies and missing critical envs into actionable alerts', () => {
    const snapshot: SystemHealthSnapshot = {
      status: 'DOWN',
      details: {
        database: { status: 'DOWN', error: 'timeout' },
        redis: { status: 'UP' },
        whatsapp: {
          status: 'DOWN',
          appId: 'MISSING',
          appSecret: 'CONFIGURED',
          webhook: 'MISSING',
          connectedWorkspaces: 3,
        },
        worker: { status: 'DOWN', error: 'HTTP 503' },
        storage: { status: 'UP', driver: 'r2' },
        config: { status: 'DOWN', missing: ['JWT_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'] },
        openai: { status: 'MISSING' },
        anthropic: { status: 'CONFIGURED' },
        stripe: { status: 'MISSING' },
        googleAuth: { status: 'CONFIGURED' },
        timestamp: '2026-04-18T16:20:00.000Z',
      },
    };

    const alerts = deriveSystemAlerts(snapshot);

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          message: 'Banco indisponível',
          detail: expect.stringContaining('timeout'),
        }),
        expect.objectContaining({
          type: 'error',
          message: 'Configuração crítica incompleta',
          detail: expect.stringContaining('JWT_SECRET'),
        }),
        expect.objectContaining({
          type: 'warning',
          message: 'Canal Meta precisa de intervenção',
          detail: expect.stringContaining('3 workspace(s)'),
        }),
        expect.objectContaining({
          type: 'warning',
          message: 'Stripe não configurado',
        }),
      ]),
    );
  });
});

describe('summarizeSystemHealth', () => {
  it('builds compact operator pills for the main dependencies', () => {
    const snapshot: SystemHealthSnapshot = {
      status: 'DEGRADED',
      details: {
        database: { status: 'UP' },
        redis: { status: 'UP' },
        whatsapp: { status: 'DOWN' },
        worker: { status: 'DEGRADED' },
        storage: { status: 'UP', driver: 'r2' },
        config: { status: 'CONFIGURED', missing: [] },
        openai: { status: 'CONFIGURED' },
        anthropic: { status: 'MISSING' },
        stripe: { status: 'CONFIGURED' },
        googleAuth: { status: 'CONFIGURED' },
        timestamp: '2026-04-18T16:20:00.000Z',
      },
    };

    expect(summarizeSystemHealth(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Banco', tone: 'success' }),
        expect.objectContaining({ label: 'Redis', tone: 'success' }),
        expect.objectContaining({ label: 'Meta', tone: 'error' }),
        expect.objectContaining({ label: 'Worker', tone: 'warning' }),
      ]),
    );
  });
});
