// Pure helpers extracted from pulse-bridge-emitter.mjs
// for split-file compliance with the architecture guard.

import { createHash } from 'node:crypto';

const fpCache = new Map();

export function fingerprint(rule, file, message) {
  const raw = `pulse:${rule}:${file}:${message}`;
  if (fpCache.has(raw)) return fpCache.get(raw);
  const h = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  fpCache.set(raw, h);
  return h;
}

const FINANCIAL_AUTH_PAYMENT_PATTERNS = [
  /\/billing\//,
  /\/checkout\//,
  /\/wallet/,
  /\/payment/,
  /\/payout/,
  /\/kyc\//,
  /\/auth\//,
  /\/login/,
  /\/signin/,
  /\/accounts\//,
  /\/settings\//,
  /\/split\//,
  /\/ledger/,
  /\/connect\//,
  /\/bank/,
  /\/carteira/,
];

export function isFinancialAuthPaymentRoute(file) {
  return FINANCIAL_AUTH_PAYMENT_PATTERNS.some((p) => p.test(file));
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export function severityScore(s) {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx === -1 ? 99 : idx;
}

export function maxSeverity(a, b) {
  return severityScore(a) <= severityScore(b) ? a : b;
}
