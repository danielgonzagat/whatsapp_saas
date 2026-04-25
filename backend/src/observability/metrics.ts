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
} as const;
