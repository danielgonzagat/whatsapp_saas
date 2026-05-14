#!/usr/bin/env node
/**
 * PCI Divergence Scanner — UTP-PCI-007 companion.
 *
 * Scans backend/src/kloel/ for references to spinal/cognitive contracts
 * and compares against the canonical PCI documents:
 *
 *   1. Event names (commerce.*, lineage.*, cognition.*, etc.)
 *      → Canonical source: docs/contracts/pci/01-event-taxonomy.md
 *   2. ABI top-level fields (lineage, identityProjection, perception, etc.)
 *      → Canonical source: docs/contracts/pci/02-abi-schema.md
 *   3. Gate names (no-roleplay, lineage-integrity, etc.)
 *      → Canonical source: docs/contracts/pci/04-pulse-gates.md
 *
 * Strategy: flag only STRONG signals of divergence — a 3-part event name
 * in a canonical domain with a non-canonical action, a gate-like string in
 * a gate-specific context that isn't canonical, or a bracket-accessed ABI
 * field name that doesn't match any known field in the PCI.2 schema.
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PCI_DIR = resolve(REPO_ROOT, 'docs', 'contracts', 'pci');
const SCAN_ROOT = resolve(REPO_ROOT, 'backend', 'src', 'kloel');

const JSON_OUTPUT = process.argv.includes('--json');

// ─── Canonical sets ──────────────────────────────────────────────────────

const CANONICAL_EVENTS = new Set();
const CANONICAL_DOMAINS = new Set();
const CANONICAL_ABI_FIELDS = new Set();
const CANONICAL_GATES = new Set();

const divergences = [];

function addDiv(kind, file, line, name, suggestion) {
  divergences.push({ kind, file, line, name, suggestion });
}

// ─── PCI document parsing ────────────────────────────────────────────────

async function loadEventTaxonomy() {
  const raw = await readFile(join(PCI_DIR, '01-event-taxonomy.md'), 'utf8');

  // Extract all backtick-quoted event references (both 2-part and 3-part)
  // 2-part: cognition.belief_updated
  // 3-part: commerce.lead.replied
  for (const ref of raw.matchAll(/`([a-z_]+\.[a-z_]+\.[a-z_]+)`/g)) {
    const name = ref[1];
    const parts = name.split('.');
    if (parts.length < 2) continue;

    // Track as canonical event name regardless of part count
    CANONICAL_EVENTS.add(name);

    // Track top-level domain
    CANONICAL_DOMAINS.add(parts[0]);
    // Track 2-part domain:entity
    if (parts.length >= 2) {
      CANONICAL_DOMAINS.add(`${parts[0]}.${parts[1]}`);
    }
  }

  // Also capture 2-part events from the table rows: | `domain.action` |
  for (const m of raw.matchAll(/^\|\s*`([a-z_]+\.[a-z_]+)`\s*\|/gm)) {
    const name = m[1];
    const parts = name.split('.');
    if (parts.length === 2) {
      CANONICAL_EVENTS.add(name);
      CANONICAL_DOMAINS.add(parts[0]);
      CANONICAL_DOMAINS.add(`${parts[0]}.${parts[1]}`);
    }
  }

  // Domain headers: ### 3.X `domain.*`
  for (const m of raw.matchAll(/###\s+\d+\.\d+\s+`([a-z_]+\.[*])`/g)) {
    CANONICAL_DOMAINS.add(m[1].replace('.*', ''));
  }
}

async function loadAbiSchema() {
  const raw = await readFile(join(PCI_DIR, '02-abi-schema.md'), 'utf8');

  // Section headers: ### 3.X `fieldName`
  for (const m of raw.matchAll(/###\s+\d+\.\d+\s+`(\w+)`/g)) {
    CANONICAL_ABI_FIELDS.add(m[1]);
  }

  // All field names from code blocks (captures sub-fields too)
  for (const m of raw.matchAll(/\n\s+(\w+):/g)) {
    CANONICAL_ABI_FIELDS.add(m[1]);
  }
}

async function loadPulseGates() {
  const raw = await readFile(join(PCI_DIR, '04-pulse-gates.md'), 'utf8');

  // ### 3.X `gate-name`
  for (const m of raw.matchAll(/###\s+\d+\.\d+\s+`([a-z][a-z-]+)`/g)) {
    CANONICAL_GATES.add(m[1]);
  }

  // Summary table: | `gate-name` |
  for (const m of raw.matchAll(/\|\s*`([a-z][a-z-]+)`\s*\|/g)) {
    CANONICAL_GATES.add(m[1]);
  }
}

// ─── File walking ────────────────────────────────────────────────────────

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { yield* walk(full); }
    else if (/\.(ts|tsx)$/.test(entry.name)) { yield full; }
  }
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

// ─── Scan one file ───────────────────────────────────────────────────────

async function scanFile(fpath) {
  const rel = fpath.slice(SCAN_ROOT.length + 1);
  const text = await readFile(fpath, 'utf8').catch(() => null);
  if (!text) return;

  // —— 1. Event names ——————————————————————————————————————————————————
  //
  // Match 2-part and 3-part dotted strings in quotes:
  //   commerce.lead.replied  (3-part)
  //   cognition.belief_updated  (2-part, entity_action combined)
  //   lineage.genesis  (2-part)
  //
  // Flag when the domain prefix IS canonical but the full name is NOT.

  const topLevelCanonical = new Set();
  for (const d of CANONICAL_DOMAINS) {
    if (!d.includes('.')) topLevelCanonical.add(d);
  }

  // Match both 2-part and 3-part: 'domain.entity_action' or 'domain.entity.action'
  // We match any 2+ dot name but filter by canonical domains
  const eventStrRe = /['"`]([a-z][a-z_]*\.[a-z][a-z_]*(?:\.[a-z][a-z_]+)?)['"`]/gi;
  let m;
  while ((m = eventStrRe.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const parts = name.split('.');
    if (parts.length < 2 || parts.length > 3) continue;

    if (CANONICAL_EVENTS.has(name)) continue;

    const domain = parts.length === 2 ? parts[0] : `${parts[0]}.${parts[1]}`;
    const action = parts[parts.length - 1];
    const topLevel = parts[0];

    // Case A: domain IS canonical, action/name is not
    if (CANONICAL_DOMAINS.has(domain)) {
      addDiv(
        'event_name', rel, lineOf(text, m.index), name,
        `"${name}" references canonical domain "${domain}" with non-canonical action "${action}". ` +
        `Valid in ${domain}: ${[...CANONICAL_EVENTS].filter(e => e.startsWith(domain + '.') || (e.split('.')[0] === domain.split('.')[0] && e.split('.')[1]?.startsWith(domain.includes('.') ? domain.split('.')[1] : ''))).filter((e, i, a) => a.indexOf(e) === i).sort().join(', ')}.`
      );
      continue;
    }

    // Case B: top-level domain IS canonical but sub-domain is not
    if (parts.length === 3 && topLevelCanonical.has(topLevel) && !CANONICAL_DOMAINS.has(domain)) {
      const ctx = text.slice(Math.max(0, m.index - 200), m.index + 200);
      const looksIntentional =
        /(EVENTS|events|eventName|event\w*Name|emit|publish|spine|Event\w*Set|Set<)/i.test(ctx) ||
        /(Event|event)\s*(=|:)/.test(ctx);
      if (looksIntentional) {
        addDiv(
          'event_name', rel, lineOf(text, m.index), name,
          `"${name}" uses canonical top-level domain "${topLevel}" with non-canonical sub-domain "${domain}". ` +
          `Closest canonical domains: ${[...CANONICAL_DOMAINS].filter(d => d.startsWith(topLevel + '.')).sort().join(', ')}. ` +
          `Verify if "${name}" should be added to PCI.1 (requires ADR + bump minor).`
        );
      }
    }
  }

  // —— 2. Gate names ———————————————————————————————————————————————————
  //
  // Only flag dashed strings that appear in EXPLICIT gate contexts:
  //   gateName: 'xxx', name: 'xxx' inside a gate function, or
  //   GATE_DEFAULT_MODE['xxx'], gateName = 'xxx'
  // This avoids flagging random test strings like "dry-run" or "ws-tenant".

  const gateCtxPatterns = [
    // gateName: 'xxx' or gateName: "xxx"
    /\bgateName\s*:\s*['"]([a-z][a-z-]+)['"]/gi,
    // name: 'xxx' inside a file whose path contains "gate"
    /\bname\s*:\s*['"]([a-z][a-z-]+)['"]/gi,
    // GATE_DEFAULT_MODE['xxx'] or resolveGateMode('xxx')
    /(?:GATE_|gate)[A-Za-z_]*\['([a-z][a-z-]+)'\]/gi,
    /(?:gate|Gate)\w*\(\s*'([a-z][a-z-]+)'\s*\)/gi,
  ];

  for (const pattern of gateCtxPatterns) {
    for (const m of text.matchAll(pattern)) {
      const name = m[1].toLowerCase();
      if (!name.includes('-')) continue;             // gates always have dashes
      if (CANONICAL_GATES.has(name)) continue;       // already canonical

      // Extra gate-context check
      const ctx = text.slice(Math.max(0, m.index - 100), m.index + 100);
      const inGateFile = /gate|pulse/i.test(rel) || /gate|pulse/i.test(ctx);

      if (inGateFile || /\bgate\b/i.test(ctx)) {
        addDiv(
          'gate_name', rel, lineOf(text, m.index), name,
          `"${name}" in gate context is not canonical. Known gates: ${[...CANONICAL_GATES].sort().join(', ')}.`
        );
      }
    }
  }

  // —— 3. ABI field names ———————————————————————————————————————————————
  //
  // Only flag bracket-notation access on variables named `abi` or
  // `abiPayload`:  abi['fieldName']  or  abi["fieldName"]
  // This pattern is the strongest signal of explicit ABI field access.

  for (const m of text.matchAll(/\b(abi|abiPayload)\[(['"])(\w+)\2\]/gi)) {
    const field = m[3];
    if (CANONICAL_ABI_FIELDS.has(field)) continue;

    addDiv(
      'abi_field', rel, lineOf(text, m.index), field,
      `"${field}" accessed as ABI field but not found in PCI.2 schema. ` +
      `Known top-level fields: abiVersion, lineage, identityProjection, perception, ` +
      `beliefs, predictions, attention, memory, capabilities, valence, pulseTruth, ` +
      `workspaceLocalProfile, wisdomContext, roleContext, currentInput.`
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  await loadEventTaxonomy();
  await loadAbiSchema();
  await loadPulseGates();

  if (!JSON_OUTPUT) {
    process.stderr.write(
      `PCI divergence scan — ` +
      `${CANONICAL_EVENTS.size} events, ${CANONICAL_ABI_FIELDS.size} ABI fields, ` +
      `${CANONICAL_GATES.size} gates loaded\n`
    );
  }

  for await (const fp of walk(SCAN_ROOT)) {
    await scanFile(fp);
  }

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({
      canonical: {
        eventNames: CANONICAL_EVENTS.size,
        abiFields: CANONICAL_ABI_FIELDS.size,
        gates: CANONICAL_GATES.size,
      },
      divergences,
      total: divergences.length,
    }, null, 2) + '\n');
  } else {
    if (divergences.length === 0) {
      process.stderr.write('\nNo divergences found. All references match PCI contracts.\n');
    } else {
      process.stderr.write(`\n${divergences.length} divergence(s):\n\n`);
      for (const d of divergences) {
        process.stderr.write(`  [${d.kind}] ${d.file}:${d.line}\n`);
        process.stderr.write(`    ref: ${d.name}\n`);
        process.stderr.write(`    fix: ${d.suggestion}\n\n`);
      }
    }
  }

  return divergences.length;
}

// ─── CLI entry point (only when executed directly) ──────────────────────

const isDirect = process.argv[1] && (
  process.argv[1].endsWith('/divergence-scan.mjs') ||
  process.argv[1].endsWith('\\divergence-scan.mjs')
);

if (isDirect) {
  main()
    .then((count) => process.exit(count > 0 ? 2 : 0))
    .catch((err) => {
      process.stderr.write(`Divergence scanner crashed: ${err.stack || err.message}\n`);
      process.exit(1);
    });
}

export { loadCanonicalSets, CANONICAL_EVENTS, CANONICAL_ABI_FIELDS, CANONICAL_GATES, divergences, scanFile };

async function loadCanonicalSets() {
  await loadEventTaxonomy();
  await loadAbiSchema();
  await loadPulseGates();
}
