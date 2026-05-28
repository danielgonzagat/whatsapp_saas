#!/usr/bin/env node
// Gate: enforce single-namespace canonical event names in AsyncAPI registry.
// Rejects bare X.* entries when commerce.X.* (or other authoritative namespace) exists.
// Currently enforces: any `checkout.*` channel must use `commerce.checkout.*`.

import fs from 'node:fs';
import path from 'node:path';

const REGISTRY = path.resolve('tools/asyncapi/asyncapi-spec.json');
const FORBIDDEN_PREFIXES = ['checkout.'];

if (!fs.existsSync(REGISTRY)) {
  console.error(`[gate-event-taxonomy-namespace] registry missing: ${REGISTRY}`);
  process.exit(2);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const channels = Object.keys(registry?.channels ?? {});

const violations = channels.filter((name) => FORBIDDEN_PREFIXES.some((p) => name.startsWith(p)));

if (violations.length === 0) {
  console.log('[gate-event-taxonomy-namespace] OK — no forbidden bare-namespace events');
  process.exit(0);
}

console.error(
  `[gate-event-taxonomy-namespace] ${violations.length} forbidden bare-namespace event(s):`,
);
for (const v of violations) console.error(`  - ${v}`);
console.error(
  'Migrate to the canonical namespace (e.g. `commerce.checkout.*`) and remove the bare entry.',
);
process.exit(1);
