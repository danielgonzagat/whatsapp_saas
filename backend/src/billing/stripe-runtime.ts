import { createRequire } from 'node:module';

const stripeRequire = createRequire(__filename);

// Resolve Stripe constructor robustly across Node ESM/CJS interop modes.
// On Node 22+/24+ certain bundlers wrap CJS exports such that `require('stripe')`
// returns `{ default: StripeConstructor, ... }` instead of the constructor itself.
// When that happens, `new StripeRuntime(key)` silently returns an instance whose
// properties (.customers, .paymentMethods) are undefined, causing the Sentry
// NODE-S error spike (1,026 events / 14d on /billing/payment-methods).
//
// Strategy: enumerate callable candidates from every interop shape;
// validate each by instantiating with a dummy key and probing .customers.
// The first candidate that produces a valid instance wins.
function resolveStripeConstructor(): typeof import('stripe') {
  const mod = stripeRequire('stripe') as never as
    | typeof import('stripe')
    | { default: typeof import('stripe'); Stripe?: typeof import('stripe') };

  // Gather every plausible constructor candidate across interop shapes.
  const candidates: Array<{ fn: (...args: unknown[]) => unknown; source: string }> = [];

  if (typeof mod === 'function') {
    candidates.push({ fn: mod as (...args: unknown[]) => unknown, source: 'direct' });
  }
  if (mod && typeof (mod as { default?: unknown }).default === 'function') {
    candidates.push({
      fn: (mod as { default: (...args: unknown[]) => unknown }).default,
      source: 'default',
    });
  }
  if (mod && typeof (mod as { Stripe?: unknown }).Stripe === 'function') {
    candidates.push({
      fn: (mod as { Stripe: (...args: unknown[]) => unknown }).Stripe,
      source: 'Stripe',
    });
  }

  if (candidates.length === 0) {
    throw new Error(
      'stripe-runtime: no callable candidate — ' +
        `require('stripe') returned ${typeof mod} (keys: ${mod ? Object.keys(mod).slice(0, 6).join(',') : 'n/a'})`,
    );
  }

  // Validate each candidate by instantiating a probe and checking that
  // the instance exposes the resource methods the service actually calls
  // (.customers.create/.retrieve, .paymentMethods.list/.attach/.detach/.retrieve,
  // .checkout.sessions.create). A shape with .customers as an object but
  // .customers.create undefined is the exact failure mode that produced
  // Sentry NODE-S — checking only the namespace let it through.
  const failures: string[] = [];
  const requiredMethods: Array<[string, string]> = [
    ['customers', 'create'],
    ['customers', 'retrieve'],
    ['paymentMethods', 'list'],
    ['paymentMethods', 'attach'],
  ];
  for (const { fn, source } of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctor = fn as unknown as new (...args: any[]) => unknown;
      const probe: unknown = new Ctor('sk_test_stripe_runtime_probe');
      if (!probe || typeof probe !== 'object') {
        failures.push(`${source}: probe is ${typeof probe}`);
        continue;
      }
      const probeObj = probe as Record<string, unknown>;
      const missing: string[] = [];
      for (const [namespace, method] of requiredMethods) {
        const ns = probeObj[namespace];
        if (!ns || typeof ns !== 'object') {
          missing.push(`.${namespace} (${typeof ns})`);
          continue;
        }
        const fnRef = (ns as Record<string, unknown>)[method];
        if (typeof fnRef !== 'function') {
          missing.push(`.${namespace}.${method} (${typeof fnRef})`);
        }
      }
      if (missing.length === 0) {
        return fn as typeof import('stripe');
      }
      failures.push(`${source}: missing ${missing.join(', ')}`);
    } catch (err: unknown) {
      failures.push(`${source}: constructor threw — ${String(err)}`);
    }
  }

  throw new Error(
    'stripe-runtime: all constructor candidates failed validation —\n' +
      failures.map((f) => `  • ${f}`).join('\n') +
      `\n  require('stripe') shape: ${typeof mod} (keys: ${mod ? Object.keys(mod).slice(0, 6).join(',') : 'n/a'})`,
  );
}

/** Stripe runtime — constructor resolved across Node interop modes. */
export const StripeRuntime = resolveStripeConstructor();
