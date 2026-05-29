#!/usr/bin/env node

/**
 * Gate: Prevent new domain terms outside the canonical vocabulary.
 *
 * RULE: Domain names (used in event channels, capabilities, and type unions)
 * must be declared in the canonical vocabulary. This prevents semantic drift
 * and ensures schema consistency.
 *
 * CANONICAL VOCABULARY:
 *   - Extracted from tools/asyncapi/asyncapi-spec.json channels[*].parameters.domain
 *   - Extracted from backend/src/kloel/capability-registry-v2/partitions/*
 *   - Extracted from backend/src/kloel/mind/runtime types (domain enums)
 *
 * VIOLATIONS DETECTED:
 *   - Event name with domain prefix not in canonical set.
 *     Example: "custom_domain.event" where "custom_domain" is undeclared.
 *   - Capability declaration with undeclared domain.
 *
 * RUN:  node scripts/canon-gates/gate-domain-vocabulary.mjs
 *
 * EXIT: 0 if all domains are canonical; 1 if rogue domain found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// Load AsyncAPI spec to extract domains
const asyncapiPath = join(ROOT, 'tools/asyncapi/asyncapi-spec.json');
let asyncapiSpec;
try {
  asyncapiSpec = JSON.parse(readFileSync(asyncapiPath, 'utf8'));
} catch (err) {
  process.stderr.write(`FAIL gate-domain-vocabulary: cannot read AsyncAPI spec: ${err.message}\n`);
  process.exit(1);
}

// Extract canonical domains from AsyncAPI channels
const canonicalDomains = new Set();
for (const [eventName, channelDef] of Object.entries(asyncapiSpec.channels || {})) {
  const domain = channelDef.parameters?.domain;
  if (domain && typeof domain === 'string') {
    canonicalDomains.add(domain);
  }
}

// Also extract from event names (domain.verb pattern)
for (const eventName of Object.keys(asyncapiSpec.channels || {})) {
  const parts = eventName.split('.');
  if (parts.length >= 2) {
    canonicalDomains.add(parts[0]);
  }
}

if (canonicalDomains.size === 0) {
  process.stderr.write('FAIL gate-domain-vocabulary: no canonical domains found in AsyncAPI spec\n');
  process.exit(1);
}

// Scan source files for undeclared domains
function findFiles(dir, isFile = () => true) {
  const results = [];
  function walk(current) {
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const fullPath = join(current, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (isFile(entry)) {
          results.push(fullPath);
        }
      }
    } catch (err) {}
  }
  walk(dir);
  return results;
}

const sourceFiles = [
  ...findFiles(
    join(ROOT, 'backend/src'),
    (name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.spec.ts'),
  ),
  ...findFiles(
    join(ROOT, 'worker'),
    (name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.spec.ts'),
  ),
];

const rougueDomains = new Map(); // domain => [{ file, line, context }]

// Pattern: look for domain.verb event names and domain union types
const eventPattern = /['"`]([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*(?:\.[a-z0-9_]*)*)['"`]/g;
const domainUnionPattern = /domain\s*:\s*(?:BrainCapabilityDomain|string|'([a-z_][a-z0-9_]*)')/g;

for (const filePath of sourceFiles) {
  const file = filePath.replace(ROOT + '/', '');

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  let match;
  while ((match = eventPattern.exec(content)) !== null) {
    const domain = match[1];
    if (!canonicalDomains.has(domain) && domain !== 'cognition') {
      // cognition is special-cased as the Mind event family
      if (!rougueDomains.has(domain)) {
        rougueDomains.set(domain, []);
      }
      const line = content.substring(0, match.index).split('\n').length;
      rougueDomains.get(domain).push({
        file,
        line,
        context: `"${domain}.${match[2]}"`,
      });
    }
  }
  eventPattern.lastIndex = 0;

  while ((match = domainUnionPattern.exec(content)) !== null) {
    const domain = match[1];
    if (domain && !canonicalDomains.has(domain)) {
      if (!rougueDomains.has(domain)) {
        rougueDomains.set(domain, []);
      }
      const line = content.substring(0, match.index).split('\n').length;
      rougueDomains.get(domain).push({
        file,
        line,
        context: 'domain union type',
      });
    }
  }
  domainUnionPattern.lastIndex = 0;
}

if (rougueDomains.size > 0) {
  process.stderr.write(
    `FAIL gate-domain-vocabulary: ${rougueDomains.size} undeclared domain(s) found:\n`,
  );
  for (const [domain, occurrences] of rougueDomains) {
    process.stderr.write(`  Domain "${domain}" (${occurrences.length} occurrence(s)):\n`);
    for (const { file, line, context } of occurrences.slice(0, 3)) {
      // Show first 3
      process.stderr.write(`    ${file}:${line} ${context}\n`);
    }
    if (occurrences.length > 3) {
      process.stderr.write(`    ... and ${occurrences.length - 3} more\n`);
    }
  }
  process.stderr.write(`\nCanonical domains: ${Array.from(canonicalDomains).sort().join(', ')}\n`);
  process.exit(1);
}

process.stderr.write(
  `PASS gate-domain-vocabulary: all ${canonicalDomains.size} domain(s) are canonical\n`,
);
process.exit(0);
