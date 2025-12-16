// Jest E2E global setup
// - Clears Prometheus metrics registry to avoid "already been registered" across suites.

import * as promClient from 'prom-client';
import { shutdownQueueSystem } from '../src/queue/queue';

beforeEach(() => {
  promClient.register?.clear?.();
});

afterAll(async () => {
  await shutdownQueueSystem();
});
