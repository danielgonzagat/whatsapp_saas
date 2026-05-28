#!/usr/bin/env node
/**
 * CI gate: verifies every Plan row has a real Stripe price ID.
 *
 * Fails if any Plan.stripePriceId is null or starts with "price_test_"
 * when the environment is production (KLOEL_LIVE_MODE=confirmed or
 * NODE_ENV=production with sk_live_ Stripe key).
 *
 * Reads DB via DATABASE_URL from env.
 */

import { createRequire } from 'node:module';

const prismaRequire = createRequire(import.meta.url);

let PrismaClient;
try {
  PrismaClient = prismaRequire('@prisma/client').PrismaClient;
} catch {
  console.error('check-stripe-products: @prisma/client not found. Run from repo root.');
  process.exit(1);
}

function isProduction() {
  const nodeEnv = process.env.NODE_ENV || '';
  const liveMode = process.env.KLOEL_LIVE_MODE || '';
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  return (
    nodeEnv === 'production' ||
    liveMode === 'confirmed' ||
    stripeKey.startsWith('sk_live_')
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('check-stripe-products: DATABASE_URL not set — skipping (no DB).');
    process.exit(0);
  }

  const prod = isProduction();
  console.log(`check-stripe-products: env=${prod ? 'PRODUCTION' : 'non-production'}`);

  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const plans = await prisma.productPlan.findMany({
      where: { active: true },
      select: { id: true, name: true, stripePriceId: true },
    });

    if (plans.length === 0) {
      console.log('check-stripe-products: no active ProductPlan rows. Nothing to check.');
      process.exit(0);
    }

    let failed = false;
    for (const plan of plans) {
      if (!plan.stripePriceId) {
        console.error(`FAIL: Plan "${plan.name}" (${plan.id}) has null stripePriceId.`);
        failed = true;
      } else if (prod && plan.stripePriceId.startsWith('price_test_')) {
        console.error(
          `FAIL: Plan "${plan.name}" (${plan.id}) has test price ID ` +
          `"${plan.stripePriceId}" in production.`,
        );
        failed = true;
      } else {
        console.log(
          `OK: Plan "${plan.name}" (${plan.id}) → ${plan.stripePriceId}`,
        );
      }
    }

    if (failed) {
      console.error('\ncheck-stripe-products: one or more plans have invalid Stripe price IDs.');
      process.exit(1);
    }

    console.log(`\ncheck-stripe-products: OK — ${plans.length} plan(s) verified.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
