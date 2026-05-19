import tracer from 'dd-trace';

const DD_PREFIX = 'kloel.';

const BASE_TAGS: Record<string, string> = {
  env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
  service: process.env.DD_SERVICE || 'kloel-backend',
  version: process.env.DD_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA || '0.0.0',
};

function getClient() {
  return tracer.dogstatsd;
}

function flatTags(extra?: Record<string, string>): string[] {
  const merged = { ...BASE_TAGS, ...extra };
  return Object.entries(merged).map(([k, v]) => `${k}:${v}`);
}

export function increment(name: string, tags?: Record<string, string>): void {
  getClient().increment(`${DD_PREFIX}${name}`, 1, flatTags(tags));
}

export function histogram(name: string, value: number, tags?: Record<string, string>): void {
  getClient().histogram(`${DD_PREFIX}${name}`, value, flatTags(tags));
}

export function gauge(name: string, value: number, tags?: Record<string, string>): void {
  getClient().gauge(`${DD_PREFIX}${name}`, value, flatTags(tags));
}

export const Metrics = {
  checkout: {
    started(t?: Record<string, string>) {
      increment('checkout.started', t);
    },
    completed(t?: Record<string, string>) {
      increment('checkout.completed', t);
    },
    duration(ms: number, t?: Record<string, string>) {
      histogram('checkout.duration_ms', ms, t);
    },
  },
  payment: {
    processed(method: string, t?: Record<string, string>) {
      increment('payment.processed', { ...t, payment_method: method });
    },
    latency(ms: number, method: string, t?: Record<string, string>) {
      histogram('payment.latency_ms', ms, { ...t, payment_method: method });
    },
  },
  whatsapp: {
    messageReceived(t?: Record<string, string>) {
      increment('whatsapp.message_received', t);
    },
    messageSent(t?: Record<string, string>) {
      increment('whatsapp.message_sent', t);
    },
    sessionConnected(ws: string) {
      increment('whatsapp.session_connected', { workspace_id: ws });
    },
    sessionDisconnected(ws: string) {
      increment('whatsapp.session_disconnected', { workspace_id: ws });
    },
  },
  mailbox: {
    connected(provider: string, t?: Record<string, string>) {
      increment('mailbox.connected', { ...t, provider });
    },
    syncCompleted(provider: string, imported: number, seen: number, t?: Record<string, string>) {
      increment('mailbox.sync.completed', { ...t, provider });
      histogram('mailbox.sync.imported', imported, { ...t, provider });
      histogram('mailbox.sync.seen', seen, { ...t, provider });
    },
    syncFailed(provider: string, reason: string, t?: Record<string, string>) {
      increment('mailbox.sync.failed', { ...t, provider, reason });
    },
    sendCompleted(provider: string, t?: Record<string, string>) {
      increment('mailbox.send.completed', { ...t, provider });
    },
    sendFailed(provider: string, reason: string, t?: Record<string, string>) {
      increment('mailbox.send.failed', { ...t, provider, reason });
    },
    sendSuppressed(provider: string, t?: Record<string, string>) {
      increment('mailbox.send.suppressed', { ...t, provider });
    },
  },
  api: {
    request(route: string, code: number, ms: number) {
      increment('api.request', { route, status: String(code) });
      histogram('api.request_latency_ms', ms, { route });
    },
  },
  auth: {
    loginSuccess(p: string, t?: Record<string, string>) {
      increment('auth.login_success', { ...t, provider: p });
    },
    loginFailed(r: string, t?: Record<string, string>) {
      increment('auth.login_failed', { ...t, reason: r });
    },
  },
  queue: {
    enqueued(q: string, t?: Record<string, string>) {
      increment('queue.enqueued', { ...t, queue: q });
    },
    processed(q: string, t?: Record<string, string>) {
      increment('queue.processed', { ...t, queue: q });
    },
    depth(q: string, d: number) {
      gauge('queue.depth', d, { queue: q });
    },
  },
  billing: {
    subscriptionCreated(plan: string, t?: Record<string, string>) {
      increment('billing.subscription.created', { ...t, plan });
    },
    subscriptionCancelled(plan: string, t?: Record<string, string>) {
      increment('billing.subscription.cancelled', { ...t, plan });
    },
    paymentFailed(reason: string, gateway: string, t?: Record<string, string>) {
      increment('billing.payment.failed', { ...t, reason, gateway });
    },
    invoicePaid(amountCents: number, t?: Record<string, string>) {
      histogram('billing.invoice.amount_cents', amountCents, t);
    },
  },
  wallet: {
    credited(amountCents: number, t?: Record<string, string>) {
      increment('wallet.credited', t);
      histogram('wallet.credit_amount_cents', amountCents, t);
    },
    debited(amountCents: number, t?: Record<string, string>) {
      increment('wallet.debited', t);
      histogram('wallet.debit_amount_cents', amountCents, t);
    },
    topupInitiated(amountCents: number, t?: Record<string, string>) {
      increment('wallet.topup_initiated', t);
      histogram('wallet.topup_amount_cents', amountCents, t);
    },
    balanceLow(balanceCents: number, t?: Record<string, string>) {
      increment('wallet.balance_low', t);
      gauge('wallet.balance_cents', balanceCents, t);
    },
  },
  brain: {
    decide(workspaceId: string, durationMs: number, source: string, t?: Record<string, string>) {
      increment('brain.decide', { ...t, workspace_id: workspaceId, source });
      histogram('brain.decide.duration_ms', durationMs, { ...t, source });
    },
    decideFailed(workspaceId: string, reason: string, t?: Record<string, string>) {
      increment('brain.decide.failed', { ...t, workspace_id: workspaceId, reason });
    },
  },
  autopilot: {
    cycleStarted(workspaceId: string, t?: Record<string, string>) {
      increment('autopilot.cycle.started', { ...t, workspace_id: workspaceId });
    },
    cycleCompleted(workspaceId: string, durationMs: number, t?: Record<string, string>) {
      increment('autopilot.cycle.completed', { ...t, workspace_id: workspaceId });
      histogram('autopilot.cycle.duration_ms', durationMs, { ...t });
    },
  },
  ledger: {
    reconciliationDrift(amountCents: number, t?: Record<string, string>) {
      gauge('ledger.reconciliation_drift_cents', amountCents, t);
    },
    reconciliationRun(t?: Record<string, string>) {
      increment('ledger.reconciliation.run', t);
    },
  },
  endpoint: {
    success(name: string, t?: Record<string, string>) {
      increment(`endpoint.${name}.success`, t);
    },
    failure(name: string, t?: Record<string, string>) {
      increment(`endpoint.${name}.failure`, t);
    },
    duration(name: string, ms: number, t?: Record<string, string>) {
      histogram(`endpoint.${name}.duration_ms`, ms, t);
    },
  },
} as const;
