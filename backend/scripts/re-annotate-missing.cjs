#!/usr/bin/env node
/**
 * Safe re-annotation: only adds @RouteClass and import where missing.
 * Does NOT remove anything.
 */

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', 'src');

const CLASSIFICATION = new Map([
  ['calendar/calendar.controller.ts', 'read'],
  ['inbox/inbox.controller.ts', 'mutate'],
  ['product-categories/product-categories.controller.ts', 'mutate'],
  ['crm/crm.controller.ts', 'read'],
  ['checkout/checkout-public.controller.ts', 'public-checkout'],
  ['kloel/kloel.controller.ts', 'ai'],
  ['kloel/payment.controller.ts', 'mutate'],
  ['kloel/product-sub-resources/product-ai-config.controller.ts', 'mutate'],
  ['kloel/product-sub-resources/product-commission.controller.ts', 'mutate'],
  ['kloel/product-sub-resources/product-affiliate.controller.ts', 'mutate'],
  ['kloel/product-sub-resources/product-campaign.controller.ts', 'mutate'],
  ['kloel/product-sub-resources/product-url.controller.ts', 'mutate'],
  ['kloel/site.controller.ts', 'mutate'],
  ['kloel/pdf-processor.controller.ts', 'ai'],
  ['kloel/guest-chat.controller.ts', 'ai'],
  ['kloel/upload.controller.ts', 'mutate'],
  ['partnerships/partnerships.controller.ts', 'mutate'],
  ['marketing/marketing.controller.ts', 'read'],
  ['marketing/email-marketing.controller.ts', 'mutate'],
  ['affiliate/affiliate.controller.ts', 'mutate'],
  ['campaigns/campaigns.controller.ts', 'mutate'],
  ['webhooks/tiktok-webhook.controller.ts', 'webhook'],
  ['webhooks/webhooks.controller.ts', 'webhook'],
  ['webhooks/payment-webhook-generic.controller.ts', 'webhook'],
  ['webhooks/whatsapp-api-webhook.controller.ts', 'webhook'],
  ['webhooks/payment-webhook-stripe.controller.ts', 'webhook'],
  ['flows/flows.controller.ts', 'mutate'],
  ['billing/billing.controller.ts', 'mutate'],
  ['whatsapp/whatsapp.controller.ts', 'mutate'],
  ['member-area/member-areas.controller.ts', 'mutate'],
  ['analytics/analytics.controller.ts', 'read'],
  ['reports/reports.controller.ts', 'read'],
]);

let fixed = 0;

for (const [rel, routeClass] of CLASSIFICATION) {
  const fp = path.join(SRC, rel);
  if (!fs.existsSync(fp)) {
    console.log(`  SKIP (not found): ${rel}`);
    continue;
  }
  let content = fs.readFileSync(fp, 'utf8');

  if (content.includes('@RouteClass(')) {
    console.log(`  SKIP (already annotated): ${rel}`);
    continue;
  }

  // Compute relative import path
  const fromDir = path.dirname(fp);
  let importRel = path.relative(fromDir, path.join(SRC, 'common/throttler/route-class.decorator'));
  if (!importRel.startsWith('.')) importRel = './' + importRel;
  const importLine = `import { RouteClass } from '${importRel}';`;

  // Insert import before the first non-import, non-comment line (after all imports)
  const lines = content.split('\n');
  let insertIdx = 0;
  let inMultiLineImport = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith('} from ') || trimmed === '}' || trimmed === '') {
      if (trimmed.startsWith('import {') && !trimmed.includes('} from')) {
        inMultiLineImport = true;
      }
      if (inMultiLineImport && trimmed.includes('} from')) {
        inMultiLineImport = false;
      }
      insertIdx = i + 1;
      continue;
    }
    if (trimmed.startsWith('/**') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) {
      insertIdx = i + 1;
      continue;
    }
    if (inMultiLineImport) continue;
    break;
  }
  lines.splice(insertIdx, 0, importLine);
  content = lines.join('\n');

  // Add @RouteClass('xxx') before export class
  const match = content.match(/(\n)(export class \w+)/);
  if (match) {
    content = content.replace(
      /(\n)(export class \w+)/,
      `\n@RouteClass('${routeClass}')\n$2`
    );
  }

  fs.writeFileSync(fp, content, 'utf8');
  console.log(`  ✓ ${rel} → @RouteClass('${routeClass}')`);
  fixed++;
}

console.log(`\n${fixed} controllers re-annotated.`);
