#!/usr/bin/env node
/**
 * Bootstrap the 3-plan ladder in Stripe (live or test mode).
 * Idempotent: detects existing products via metadata.kloel_plan_id and skips.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/ops/stripe-bootstrap-plans.mjs
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/ops/stripe-bootstrap-plans.mjs --live
 *
 * Outputs:
 *   tools/stripe/plan-map.json — { starter: { product, monthly, yearly }, pro: {...}, scale: {...} }
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Resolve Stripe SDK robustly (same strategy as backend/src/billing/stripe-runtime.ts) ───

const stripeRequire = createRequire(import.meta.url);

function resolveStripe() {
  const mod = stripeRequire('stripe');
  // Direct callable
  if (typeof mod === 'function') return mod;
  // ESM default wrapper
  if (mod && typeof mod.default === 'function') return mod.default;
  // Named export
  if (mod && typeof mod.Stripe === 'function') return mod.Stripe;
  throw new Error('Cannot resolve Stripe constructor from require("stripe")');
}

const Stripe = resolveStripe();

// ─── Constants ─────────────────────────────────────────────────────────────

const STRIPE_API_VERSION = '2026-04-22.dahlia';

const PLANS = [
  {
    id: 'starter',
    name: 'Kloel Starter',
    description: '1k WhatsApp messages/mo, 1 channel, 1 user',
    monthly: { amountCents: 9700, currency: 'brl' },
    yearly:  { amountCents: 93120, currency: 'brl' },  // 20% off
    metadata: { kloel_plan_id: 'starter', tier: '1' },
  },
  {
    id: 'pro',
    name: 'Kloel Pro',
    description: '10k messages, 5 channels, 5 users, AI agents',
    monthly: { amountCents: 29700, currency: 'brl' },
    yearly:  { amountCents: 285120, currency: 'brl' },
    metadata: { kloel_plan_id: 'pro', tier: '2' },
  },
  {
    id: 'scale',
    name: 'Kloel Scale',
    description: 'Unlimited messages + channels, 25 users, priority support',
    monthly: { amountCents: 99700, currency: 'brl' },
    yearly:  { amountCents: 957120, currency: 'brl' },
    metadata: { kloel_plan_id: 'scale', tier: '3' },
  },
];

// ─── Paths ─────────────────────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const outputDir = path.join(repoRoot, 'tools', 'stripe');
const outputPath = path.join(outputDir, 'plan-map.json');

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtCents(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function intervalLabel(interval) {
  return interval === 'month' ? 'monthly' : 'yearly';
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.log('STRIPE_SECRET_KEY not set — skipping Stripe bootstrap (no-op).');
    process.exit(0);
  }

  const isLive = process.argv.includes('--live');
  const mode = secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';

  if (isLive && !secretKey.startsWith('sk_live_')) {
    console.error('ERROR: --live flag set but STRIPE_SECRET_KEY does not start with sk_live_.');
    process.exit(1);
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: 'kloel-stripe-bootstrap', url: 'https://kloel.com' },
    maxNetworkRetries: 2,
    timeout: 30_000,
  });

  console.log(`Stripe bootstrap starting (mode=${mode})…\n`);

  const planMap = {};

  for (const plan of PLANS) {
    // ── Product ──────────────────────────────────────────────────────
    const productResults = await stripe.products.search({
      query: `metadata['kloel_plan_id']:'${plan.id}'`,
      limit: 1,
    });

    let product;
    if (productResults.data.length > 0) {
      product = productResults.data[0];
      console.log(`[${plan.id}] Product exists: ${product.id} (“${product.name}”)`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });
      console.log(`[${plan.id}] Product created: ${product.id}`);
    }

    const planEntry = { product: product.id };

    // ── Prices (monthly / yearly) ────────────────────────────────────
    for (const [interval, config] of Object.entries({ month: plan.monthly, year: plan.yearly })) {
      const label = intervalLabel(interval);

      const priceResults = await stripe.prices.search({
        query: `product:'${product.id}' AND metadata['interval']:'${label}'`,
        limit: 1,
      });

      let price;
      if (priceResults.data.length > 0) {
        price = priceResults.data[0];
        console.log(`[${plan.id}] ${label} price exists: ${price.id} (${fmtCents(price.unit_amount)})`);
      } else {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: config.amountCents,
          currency: config.currency,
          recurring: { interval },
          metadata: {
            interval: label,
            kloel_plan_id: plan.id,
            tier: plan.metadata.tier,
          },
        });
        console.log(`[${plan.id}] ${label} price created: ${price.id} (${fmtCents(config.amountCents)})`);
      }

      planEntry[label] = price.id;
    }

    planMap[plan.id] = planEntry;
    console.log();
  }

  // ── Emit plan-map.json ─────────────────────────────────────────────
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(planMap, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outputPath}\n`);

  // ── Summary table ──────────────────────────────────────────────────
  console.log('Summary');
  console.log('───────');
  console.log(`Mode: ${mode}`);
  for (const [id, entry] of Object.entries(planMap)) {
    const p = PLANS.find((x) => x.id === id);
    console.log(`  ${id}:`);
    console.log(`    product:   ${entry.product}`);
    console.log(`    monthly:   ${entry.monthly}  ${p ? fmtCents(p.monthly.amountCents) : ''}`);
    console.log(`    yearly:    ${entry.yearly}   ${p ? fmtCents(p.yearly.amountCents) : ''}`);
  }
  console.log(`\nDone — ${Object.keys(planMap).length} plans in plan-map.json`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
