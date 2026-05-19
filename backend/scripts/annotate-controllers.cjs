#!/usr/bin/env node
/**
 * Annotates all controllers with @RouteClass decorator.
 *
 * Reads the embedded classification map below,
 * processes each controller file, and:
 * 1. Adds `import { RouteClass } from '...'`
 * 2. Adds `@RouteClass('xxx')` before `export class`
 * 3. Removes old @nestjs/throttler imports and decorators
 */

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..');

// Route class → import path (relative from each controller)
function getImportPath(controllerPath) {
  const fromDir = path.dirname(controllerPath);
  const relPath = path.relative(fromDir, path.join(SRC, 'common/throttler/route-class.decorator'));
  return relPath.startsWith('.') ? relPath : './' + relPath;
}

const CLASSIFICATION = [
  // ── auth ──
  { p: 'auth/auth.controller.ts', rc: 'auth' },
  { p: 'kyc/kyc.controller.ts', rc: 'auth' },
  { p: 'admin/auth/admin-auth.controller.ts', rc: 'auth' },
  // ── webhook ──
  { p: 'webhooks/payment-webhook-stripe.controller.ts', rc: 'webhook' },
  { p: 'webhooks/payment-webhook-generic.controller.ts', rc: 'webhook' },
  { p: 'webhooks/webhooks.controller.ts', rc: 'webhook' },
  { p: 'webhooks/tiktok-webhook.controller.ts', rc: 'webhook' },
  { p: 'webhooks/whatsapp-api-webhook.controller.ts', rc: 'webhook' },
  { p: 'webhooks/webhook-settings.controller.ts', rc: 'webhook' },
  { p: 'meta/webhooks/meta-webhook.controller.ts', rc: 'webhook' },
  { p: 'checkout/mercado-pago-webhook.controller.ts', rc: 'webhook' },
  { p: 'marketing/email-marketing-webhook.controller.ts', rc: 'webhook' },
  { p: 'marketing/facebook-messenger.controller.ts', rc: 'webhook' },
  { p: 'meta/messenger/messenger.controller.ts', rc: 'webhook' },
  // ── public-checkout ──
  { p: 'checkout/checkout-public.controller.ts', rc: 'public-checkout' },
  { p: 'member-area/member-area-public.controller.ts', rc: 'public-checkout' },
  { p: 'kloel/site-public.controller.ts', rc: 'public-checkout' },
  // ── ai ──
  { p: 'ai-brain/knowledge-base.controller.ts', rc: 'ai' },
  { p: 'autopilot/autopilot.controller.ts', rc: 'ai' },
  { p: 'autopilot/segmentation.controller.ts', rc: 'ai' },
  { p: 'cia/cia.controller.ts', rc: 'ai' },
  { p: 'kloel/kloel.controller.ts', rc: 'ai' },
  { p: 'kloel/unified-agent.controller.ts', rc: 'ai' },
  { p: 'kloel/whatsapp-brain.controller.ts', rc: 'ai' },
  { p: 'kloel/ad-rules.controller.ts', rc: 'ai' },
  { p: 'kloel/guest-chat.controller.ts', rc: 'ai' },
  { p: 'kloel/onboarding-profile.controller.ts', rc: 'ai' },
  { p: 'kloel/memory.controller.ts', rc: 'ai' },
  { p: 'kloel/diagnostics.controller.ts', rc: 'ai' },
  { p: 'kloel/pdf-processor.controller.ts', rc: 'ai' },
  { p: 'flows/flow-optimizer.controller.ts', rc: 'ai' },
  { p: 'crm/neuro-crm.controller.ts', rc: 'ai' },
  { p: 'growth/money-machine.controller.ts', rc: 'ai' },
  // ── read ──
  { p: 'dashboard/dashboard.controller.ts', rc: 'read' },
  { p: 'analytics/analytics.controller.ts', rc: 'read' },
  { p: 'reports/reports.controller.ts', rc: 'read' },
  { p: 'health/health.controller.ts', rc: 'read' },
  { p: 'health/system-health.controller.ts', rc: 'read' },
  { p: 'audit/audit.controller.ts', rc: 'read' },
  { p: 'metrics/metrics.controller.ts', rc: 'read' },
  { p: 'ops/ops.controller.ts', rc: 'read' },
  { p: 'pulse/pulse.controller.ts', rc: 'read' },
  { p: 'cookie-consent/cookie-consent.controller.ts', rc: 'read' },
  { p: 'compliance/compliance.controller.ts', rc: 'read' },
  { p: 'admin/dashboard/admin-dashboard.controller.ts', rc: 'read' },
  { p: 'admin/reports/admin-reports.controller.ts', rc: 'read' },
  { p: 'admin/audit/admin-audit.controller.ts', rc: 'read' },
  { p: 'admin/config/admin-config.controller.ts', rc: 'read' },
  { p: 'admin/notifications/admin-notifications.controller.ts', rc: 'read' },
  { p: 'admin/sessions/admin-sessions.controller.ts', rc: 'read' },
  { p: 'admin/transactions/admin-transactions.controller.ts', rc: 'read' },
  { p: 'admin/carteira/admin-carteira.controller.ts', rc: 'read' },
  { p: 'admin/support/admin-support.controller.ts', rc: 'read' },
  { p: 'admin/compliance/admin-compliance.controller.ts', rc: 'read' },
  { p: 'admin/clients/admin-clients.controller.ts', rc: 'read' },
  { p: 'growth/growth.controller.ts', rc: 'read' },
  { p: 'calendar/calendar.controller.ts', rc: 'read' },
  { p: 'launch/launch.controller.ts', rc: 'read' },
  { p: 'app.controller.ts', rc: 'read' },
  { p: 'pipeline/pipeline.controller.ts', rc: 'read' },
  { p: 'crm/crm.controller.ts', rc: 'read' },
  { p: 'public-api/public-api.controller.ts', rc: 'read' },
  { p: 'kloel/leads.controller.ts', rc: 'read' },
  { p: 'kloel/sales.controller.ts', rc: 'read' },
  { p: 'kloel/sales-orders.controller.ts', rc: 'read' },
  { p: 'kloel/sales-subscriptions.controller.ts', rc: 'read' },
  { p: 'marketing/marketing.controller.ts', rc: 'read' },
  { p: 'flows/flow-template.controller.ts', rc: 'read' },
  // ── mutate ──
  { p: 'billing/billing.controller.ts', rc: 'mutate' },
  { p: 'billing/payment-method.controller.ts', rc: 'mutate' },
  { p: 'checkout/checkout.controller.ts', rc: 'mutate' },
  { p: 'flows/flows.controller.ts', rc: 'mutate' },
  { p: 'inbox/inbox.controller.ts', rc: 'mutate' },
  { p: 'team/team.controller.ts', rc: 'mutate' },
  { p: 'campaigns/campaigns.controller.ts', rc: 'mutate' },
  { p: 'affiliate/affiliate.controller.ts', rc: 'mutate' },
  { p: 'affiliate/affiliate-marketplace.controller.ts', rc: 'mutate' },
  { p: 'marketing/email-marketing.controller.ts', rc: 'mutate' },
  { p: 'marketing/instagram/instagram-marketing.controller.ts', rc: 'mutate' },
  { p: 'marketing/tiktok-marketing.controller.ts', rc: 'mutate' },
  { p: 'marketing/marketing-connect.controller.ts', rc: 'mutate' },
  { p: 'media/media.controller.ts', rc: 'mutate' },
  { p: 'media/video.controller.ts', rc: 'mutate' },
  { p: 'notifications/notifications.controller.ts', rc: 'mutate' },
  { p: 'workspaces/workspace.controller.ts', rc: 'mutate' },
  { p: 'whatsapp/whatsapp.controller.ts', rc: 'mutate' },
  { p: 'whatsapp/controllers/whatsapp-api.controller.ts', rc: 'mutate' },
  { p: 'whatsapp/controllers/whatsapp-catalog.controller.ts', rc: 'mutate' },
  { p: 'whatsapp/controllers/whatsapp-meta-compat.controller.ts', rc: 'mutate' },
  { p: 'whatsapp/internal-whatsapp-runtime.controller.ts', rc: 'mutate' },
  { p: 'kloel/product.controller.ts', rc: 'mutate' },
  { p: 'kloel/payment.controller.ts', rc: 'mutate' },
  { p: 'kloel/wallet.controller.ts', rc: 'mutate' },
  { p: 'kloel/smart-payment.controller.ts', rc: 'mutate' },
  { p: 'kloel/site.controller.ts', rc: 'mutate' },
  { p: 'kloel/canvas.controller.ts', rc: 'mutate' },
  { p: 'kloel/webinar.controller.ts', rc: 'mutate' },
  { p: 'kloel/upload.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-affiliate.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-ai-config.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-campaign.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-checkout.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-commission.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-coupon.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-plan.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-review.controller.ts', rc: 'mutate' },
  { p: 'kloel/product-sub-resources/product-url.controller.ts', rc: 'mutate' },
  { p: 'member-area/member-areas.controller.ts', rc: 'mutate' },
  { p: 'member-area/member-enrollments.controller.ts', rc: 'mutate' },
  { p: 'member-area/member-modules.controller.ts', rc: 'mutate' },
  { p: 'member-area/member-structure.controller.ts', rc: 'mutate' },
  { p: 'meta/meta-auth.controller.ts', rc: 'mutate' },
  { p: 'meta/ads/meta-ads.controller.ts', rc: 'mutate' },
  { p: 'meta/instagram/instagram.controller.ts', rc: 'mutate' },
  { p: 'partnerships/partnerships.controller.ts', rc: 'mutate' },
  { p: 'scrapers/scrapers.controller.ts', rc: 'mutate' },
  { p: 'gdpr/gdpr.controller.ts', rc: 'mutate' },
  { p: 'gdpr/data-delete.controller.ts', rc: 'mutate' },
  { p: 'gdpr/data-export.controller.ts', rc: 'mutate' },
  { p: 'voice/voice.controller.ts', rc: 'mutate' },
  { p: 'video/video.controller.ts', rc: 'mutate' },
  { p: 'chat/chat.controller.ts', rc: 'mutate' },
  { p: 'payments/split/split.controller.ts', rc: 'mutate' },
  { p: 'payments/connect/connect.controller.ts', rc: 'mutate' },
  { p: 'wallet/prepaid-wallet.controller.ts', rc: 'mutate' },
  { p: 'marketplace/marketplace.controller.ts', rc: 'mutate' },
  { p: 'product-categories/product-categories.controller.ts', rc: 'mutate' },
  { p: 'anuncios/anuncios.controller.ts', rc: 'mutate' },
  { p: 'api-keys/api-keys.controller.ts', rc: 'mutate' },
  { p: 'common/storage/storage.controller.ts', rc: 'mutate' },
  { p: 'followup/followup.controller.ts', rc: 'mutate' },
  { p: 'mass-send/mass-send.controller.ts', rc: 'mutate' },
  { p: 'admin/accounts/admin-accounts.controller.ts', rc: 'mutate' },
  { p: 'admin/products/admin-products.controller.ts', rc: 'mutate' },
  { p: 'admin/sales/admin-sales.controller.ts', rc: 'mutate' },
  { p: 'admin/users/admin-users.controller.ts', rc: 'mutate' },
  { p: 'admin/chat/admin-chat.controller.ts', rc: 'mutate' },
  { p: 'admin/marketing/admin-marketing.controller.ts', rc: 'mutate' },
  { p: 'admin/destructive/admin-destructive.controller.ts', rc: 'mutate' },
];

// Maps short relative path to route class
const CLASS_MAP = new Map(CLASSIFICATION.map(c => [c.p, c.rc]));

// Find all controller files
const controllerFiles = [];
function walk(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    const rp = path.relative(base, fp);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') {continue;}
      walk(fp, base);
    } else if (e.name.endsWith('.controller.ts')) {
      // Check if file has @Controller
      const content = fs.readFileSync(fp, 'utf8');
      if (content.includes('@Controller')) {
        // Strip any leading src/ from rel path for map lookup
        const cleanRel = rp.replace(/^src\//, '');
        controllerFiles.push({ abs: fp, rel: cleanRel, content });
      }
    }
  }
}
walk(SRC, SRC);

console.log(`Found ${controllerFiles.length} controllers\n`);

let annotated = 0;
let skipped = 0;
const errors = [];

for (const { abs, rel, content } of controllerFiles) {
  const routeClass = CLASS_MAP.get(rel);
  if (!routeClass) {
    errors.push(`MISSING: ${rel} — not in classification map`);
    continue;
  }

  let modified = content;

  // 1. Remove @nestjs/throttler decorators and their import lines
  // Remove import lines from @nestjs/throttler
  const throttleImportRegex = /import\s+\{[^}]*\}\s+from\s+['"]@nestjs\/throttler['"];?\s*\n/g;
  if (modified.match(throttleImportRegex)) {
    modified = modified.replace(throttleImportRegex, '');
  }

  // Remove multi-line @Throttle(...) decorators
  modified = modified.replace(/[ \t]*@Throttle\(\{[^}]*\}\)\s*\n/g, '');
  // Remove multi-line @Throttle spanning multiple lines
  modified = modified.replace(/[ \t]*@Throttle\([\s\S]*?\)\s*\n/g, '');
  // Remove single-line @SkipThrottle() and @Throttle({...})
  modified = modified.replace(/[ \t]*@SkipThrottle\([^)]*\)\s*\n/g, '');
  modified = modified.replace(/[ \t]*@Throttle\([^)]*\)\s*\n/g, '');
  // Remove @UseGuards(ThrottlerGuard) at class level (before export class)
  modified = modified.replace(/[ \t]*@UseGuards\(\s*ThrottlerGuard\s*[,\)]/g, '@UseGuards(');
  modified = modified.replace(/[ \t]*@UseGuards\(\s*ThrottlerGuard\s*\)\s*\n/g, '');
  // Clean up empty @UseGuards() left behind
  modified = modified.replace(/[ \t]*@UseGuards\(\s*\)\s*\n/g, '');

  // 2. Remove now-unused import of Throttle, SkipThrottle, ThrottlerGuard
  // Clean up any remaining isolation imports from nestjs/throttler
  modified = modified.replace(/import\s+\{[^}]*\}\s+from\s+['"]@nestjs\/throttler['"];?\s*\n/g, '');

  // 3. Add RouteClass import (right after the last @nestjs/common or similar import)
  const importPath = getImportPath(abs);
  const importLine = `import { RouteClass } from '${importPath}';\n`;
  if (!modified.includes('RouteClass')) {
    // Find the last import line from the project
    const lines = modified.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') && !lines[i].includes('@prisma/client') && !lines[i].includes('express') && !lines[i].includes('multer')) {
        lastImportIdx = i;
      }
    }
    if (lastImportIdx >= 0) {
      // Insert after the last module import
      lines.splice(lastImportIdx + 1, 0, importLine.trimEnd());
      modified = lines.join('\n');
    }
  }

  // 4. Add @RouteClass('xxx') before export class
  const exportClassRegex = /(\n)(export class (\w+))/g;
  if (modified.match(exportClassRegex) && !modified.includes('@RouteClass(')) {
    modified = modified.replace(
      exportClassRegex,
      `\n@RouteClass('${routeClass}')\n$2`
    );
  }

  // Only write if changed
  if (modified !== content) {
    fs.writeFileSync(abs, modified, 'utf8');
    annotated++;
    console.log(`  ✓ ${rel} → @RouteClass('${routeClass}')`);
  } else {
    skipped++;
    console.log(`  - ${rel} (already annotated, skipped)`);
  }
}

console.log(`\n---`);
console.log(`Done: ${annotated} annotated, ${skipped} skipped`);

if (errors.length > 0) {
  console.log(`\nMissing from classification (${errors.length}):`);
  errors.forEach(e => console.log(`  ${e}`));
}
