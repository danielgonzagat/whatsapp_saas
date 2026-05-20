#!/usr/bin/env node
// Architectural inventory scanner for the Kloel monorepo.
// Output: docs/architecture/{DOMAINS,VOCABULARY,CAPABILITY_MAP,EVENT_TAXONOMY,SERVICE_CATALOG,DUPLICATION_REGISTER}.md
//
// Pure static analysis — reads code, never modifies.

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
const OUT_DIR = join(ROOT, 'docs/architecture');

const ROOTS = [
  'backend/src',
  'frontend/src',
  'frontend-admin/src',
  'worker/src',
];

const SKIP_RE = /(node_modules|dist|\.next|build|coverage|__tests__|\.spec\.|\.test\.)/;

const tsFiles = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (SKIP_RE.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mts)$/.test(e.name)) tsFiles.push(p);
  }
}
for (const r of ROOTS) walk(join(ROOT, r));

console.log(`Scanning ${tsFiles.length} TypeScript files...`);

// ─────────── extractors ───────────

const classDecl = /export\s+(?:abstract\s+)?class\s+([A-Z]\w+)/g;
const interfaceDecl = /export\s+interface\s+([A-Z]\w+)/g;
const typeDecl = /export\s+type\s+([A-Z]\w+)\s*=/g;
const funcDecl = /export\s+(?:async\s+)?function\s+([a-zA-Z_]\w*)/g;
const arrowFunc = /export\s+const\s+([a-zA-Z_]\w*)\s*[:=]\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g;
const decoratorService = /@Injectable\(\s*\)/;
const decoratorController = /@Controller\(/;
const decoratorModule = /@Module\(/;
const decoratorProcessor = /@Processor\(/;
const eventEmit = /\.emit\s*\(\s*['"`]([\w.:_-]+)['"`]/g;
const eventOn = /\.on\s*\(\s*['"`]([\w.:_-]+)['"`]/g;
const queueRegister = /Queue\s*\(\s*['"`]([\w._-]+)['"`]/g;
const bullProcessor = /@Processor\(\s*['"`]([\w._-]+)['"`]/g;
const httpVerbs = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:['"`]([^'"`)]*)['"`])?\s*\)/g;
const prismaModel = /prisma\.([a-zA-Z_]\w*)\./g;

const symbols = []; // { name, kind, file, line }
const services = []; // { name, file }
const controllers = []; // { name, file, route? }
const modules = []; // { name, file }
const processors = []; // { name, file, queue }
const events = new Map(); // event → [{ file, kind: 'emit'|'listen' }]
const queues = new Map(); // queueName → [files]
const routes = []; // { verb, path, file }
const prismaUsage = new Map(); // model → [files]
const exportsByName = new Map(); // name → [files]

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

for (const file of tsFiles) {
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }
  const rel = relative(ROOT, file);

  const captures = [
    { re: classDecl, kind: 'class' },
    { re: interfaceDecl, kind: 'interface' },
    { re: typeDecl, kind: 'type' },
    { re: funcDecl, kind: 'function' },
    { re: arrowFunc, kind: 'function' },
  ];
  for (const { re, kind } of captures) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      symbols.push({ name: m[1], kind, file: rel, line: lineOf(src, m.index) });
      if (!exportsByName.has(m[1])) exportsByName.set(m[1], []);
      exportsByName.get(m[1]).push(rel);
    }
  }

  // services / controllers / modules / processors
  classDecl.lastIndex = 0;
  let cm;
  while ((cm = classDecl.exec(src))) {
    const name = cm[1];
    const around = src.slice(Math.max(0, cm.index - 300), cm.index + 50);
    if (decoratorService.test(around)) services.push({ name, file: rel });
    if (decoratorController.test(around)) {
      const routeMatch = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(around);
      controllers.push({ name, file: rel, route: routeMatch?.[1] ?? '' });
    }
    if (decoratorModule.test(around)) modules.push({ name, file: rel });
    if (decoratorProcessor.test(around)) {
      const queueMatch = /@Processor\(\s*['"`]([^'"`]*)['"`]/.exec(around);
      processors.push({ name, file: rel, queue: queueMatch?.[1] ?? '' });
    }
  }

  // events
  for (const [re, kind] of [[eventEmit, 'emit'], [eventOn, 'listen']]) {
    re.lastIndex = 0;
    let em;
    while ((em = re.exec(src))) {
      const e = em[1];
      if (!events.has(e)) events.set(e, []);
      events.get(e).push({ file: rel, kind });
    }
  }

  // queues
  queueRegister.lastIndex = 0;
  let qm;
  while ((qm = queueRegister.exec(src))) {
    const q = qm[1];
    if (!queues.has(q)) queues.set(q, []);
    queues.get(q).push(rel);
  }
  bullProcessor.lastIndex = 0;
  while ((qm = bullProcessor.exec(src))) {
    const q = qm[1];
    if (!queues.has(q)) queues.set(q, []);
    queues.get(q).push(rel);
  }

  // routes
  httpVerbs.lastIndex = 0;
  let rm;
  while ((rm = httpVerbs.exec(src))) {
    routes.push({ verb: rm[1].toUpperCase(), path: rm[2] ?? '', file: rel });
  }

  // prisma usage
  prismaModel.lastIndex = 0;
  let pm;
  while ((pm = prismaModel.exec(src))) {
    const model = pm[1];
    if (!prismaUsage.has(model)) prismaUsage.set(model, new Set());
    prismaUsage.get(model).add(rel);
  }
}

console.log(`Found: ${symbols.length} symbols, ${services.length} services, ${controllers.length} controllers, ${modules.length} modules, ${processors.length} processors, ${events.size} events, ${queues.size} queues, ${routes.length} routes`);

// ─────────── domain inference ───────────
// Heuristic: top-level subdirectory of backend/src OR feature folder of frontend
function domainOf(rel) {
  if (rel.startsWith('backend/src/')) {
    const parts = rel.split('/');
    return parts[2] || 'unknown';
  }
  if (rel.startsWith('frontend/src/')) {
    const parts = rel.split('/');
    if (parts[2] === 'app') return `frontend/page/${parts[3] ?? 'root'}`;
    if (parts[2] === 'components') return `frontend/components/${parts[3] ?? 'root'}`;
    return `frontend/${parts[2] ?? 'misc'}`;
  }
  if (rel.startsWith('worker/')) {
    const parts = rel.split('/');
    return `worker/${parts[2] ?? 'root'}`;
  }
  if (rel.startsWith('frontend-admin/')) {
    const parts = rel.split('/');
    return `admin/${parts[2] ?? 'root'}`;
  }
  return 'unknown';
}

const domains = new Map(); // domain → { files: Set, services: [], controllers: [], modules: [], events: Set }
function ensureDomain(d) {
  if (!domains.has(d)) domains.set(d, { files: new Set(), services: [], controllers: [], modules: [], events: new Set() });
  return domains.get(d);
}
for (const f of tsFiles) {
  const rel = relative(ROOT, f);
  ensureDomain(domainOf(rel)).files.add(rel);
}
for (const s of services) ensureDomain(domainOf(s.file)).services.push(s);
for (const c of controllers) ensureDomain(domainOf(c.file)).controllers.push(c);
for (const m of modules) ensureDomain(domainOf(m.file)).modules.push(m);
for (const [eventName, refs] of events) {
  for (const r of refs) ensureDomain(domainOf(r.file)).events.add(eventName);
}

// ─────────── duplication detection ───────────
// Semantic duplication: same canonical concept across multiple implementations.

const CANONICAL_PATTERNS = [
  { canonical: 'send_message', regex: /^(sendMessage|sendWhatsapp|sendText|sendChannel|dispatchText|dispatchMessage|deliverMessage|emitMessage|postMessage|publishMessage|wahaSend)/i },
  { canonical: 'normalize_phone', regex: /^(normalizePhone|normalizeNumber|cleanPhone|formatPhone|toE164|phoneToE164|phoneNormalize)/i },
  { canonical: 'resolve_tenant', regex: /^(resolveTenant|resolveWorkspace|getTenantId|getWorkspaceId|extractTenant|tenantFromRequest)/i },
  { canonical: 'parse_webhook', regex: /^(parseWebhook|webhookParse|extractEvent|decodeWebhook|parseInbound|inboundParse)/i },
  { canonical: 'idempotency_check', regex: /^(isIdempotent|alreadyProcessed|checkIdempotency|dedupeEvent|hasBeenSeen)/i },
  { canonical: 'recover_cart', regex: /^(recoverCart|abandonedCart|recoverAbandonedCart|reactivateCart|cartRecovery)/i },
  { canonical: 'score_intent', regex: /^(scoreIntent|commercialIntent|computeIntent|intentScore)/i },
  { canonical: 'qualify_contact', regex: /^(qualifyContact|qualifyLead|leadQualification|contactQualify)/i },
  { canonical: 'authenticate_user', regex: /^(authenticate|loginUser|signIn|verifyCredentials|checkCredentials)/i },
  { canonical: 'connect_channel', regex: /^(connectChannel|connectWhatsapp|startSession|initSession|attachChannel)/i },
  { canonical: 'process_payment', regex: /^(processPayment|chargePayment|capturePayment|confirmPayment|payNow)/i },
  { canonical: 'create_checkout', regex: /^(createCheckout|startCheckout|initCheckout|buildCheckout|newCheckout)/i },
];

const capabilityMap = new Map();
for (const p of CANONICAL_PATTERNS) capabilityMap.set(p.canonical, []);

for (const sym of symbols) {
  if (sym.kind !== 'function' && sym.kind !== 'class') continue;
  for (const p of CANONICAL_PATTERNS) {
    if (p.regex.test(sym.name)) {
      capabilityMap.get(p.canonical).push(sym);
    }
  }
}

// Also detect exact-name duplicates across files
const exactDuplicates = [];
for (const [name, files] of exportsByName) {
  if (files.length > 1 && /^[a-zA-Z][\w]{2,}$/.test(name)) {
    // ignore noise like single-char or common
    const uniqueFiles = [...new Set(files)];
    if (uniqueFiles.length > 1) {
      exactDuplicates.push({ name, files: uniqueFiles });
    }
  }
}
exactDuplicates.sort((a, b) => b.files.length - a.files.length);

// ─────────── event taxonomy normalization ───────────
const eventCanonical = new Map(); // canonical → [variants]
for (const [event] of events) {
  // Canonicalize to lower-dot form
  const canonical = event
    .replace(/[._:\-]+/g, '.')
    .toLowerCase();
  if (!eventCanonical.has(canonical)) eventCanonical.set(canonical, new Set());
  eventCanonical.get(canonical).add(event);
}
const eventDuplicates = [...eventCanonical.entries()].filter(([, variants]) => variants.size > 1);

// ─────────── write outputs ───────────
mkdirSync(OUT_DIR, { recursive: true });

function writeMd(name, content) {
  writeFileSync(join(OUT_DIR, name), content);
  console.log(`  wrote docs/architecture/${name}`);
}

// 1) CANONICAL_DOMAINS.md
{
  const sorted = [...domains.entries()].sort((a, b) => b[1].files.size - a[1].files.size);
  const lines = [
    '# Kloel Canonical Domains',
    '',
    '> Generated by `tools/canonicalize/scan.mjs`. Static inventory of every domain (top-level module) in the codebase, with file count, service count, and event surface.',
    '',
    `Total domains: ${domains.size}. Total files scanned: ${tsFiles.length}.`,
    '',
    '| Domain | Files | Services | Controllers | Modules | Events |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const [domain, d] of sorted) {
    lines.push(`| \`${domain}\` | ${d.files.size} | ${d.services.length} | ${d.controllers.length} | ${d.modules.length} | ${d.events.size} |`);
  }
  writeMd('CANONICAL_DOMAINS.md', lines.join('\n') + '\n');
}

// 2) SERVICE_CATALOG.md
{
  const byDomain = new Map();
  for (const s of services) {
    const d = domainOf(s.file);
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(s);
  }
  const lines = [
    '# Kloel Service Catalog',
    '',
    '> Every `@Injectable()` class with its domain assignment. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    `Total services: ${services.length}. Sorted by domain.`,
    '',
  ];
  for (const [domain, list] of [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`## ${domain} (${list.length})`);
    lines.push('');
    for (const s of list.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`- \`${s.name}\` — \`${s.file}\``);
    }
    lines.push('');
  }
  writeMd('SERVICE_CATALOG.md', lines.join('\n'));
}

// 3) CAPABILITY_MAP.md
{
  const lines = [
    '# Kloel Capability Map',
    '',
    '> Functional capabilities detected via canonical name patterns. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    'Each capability lists every implementation found across the codebase. A capability with **>1 implementation** is a candidate for canonicalization (pick one canonical name, deprecate the rest).',
    '',
  ];
  for (const [cap, impls] of capabilityMap) {
    const marker = impls.length > 1 ? ' ⚠️ duplicated' : impls.length === 1 ? '' : ' ⚪ not implemented';
    lines.push(`## CAPABILITY: \`${cap}\` (${impls.length} implementations${marker})`);
    lines.push('');
    if (impls.length === 0) {
      lines.push('No implementation detected. May not be a feature of this codebase.');
      lines.push('');
      continue;
    }
    for (const impl of impls) {
      lines.push(`- \`${impl.name}\` (${impl.kind}) — \`${impl.file}:${impl.line}\``);
    }
    lines.push('');
  }
  writeMd('CAPABILITY_MAP.md', lines.join('\n'));
}

// 4) EVENT_TAXONOMY.md
{
  const lines = [
    '# Kloel Event Taxonomy',
    '',
    '> All `.emit(...)` and `.on(...)` strings detected statically. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    `Total unique events: ${events.size}. Events with naming variants (same canonical form, different cases/separators): ${eventDuplicates.length}.`,
    '',
    '## Variants flagged for canonicalization',
    '',
  ];
  if (eventDuplicates.length === 0) {
    lines.push('None detected. ✅');
  } else {
    for (const [canonical, variants] of eventDuplicates.sort((a, b) => b[1].size - a[1].size)) {
      lines.push(`### \`${canonical}\``);
      lines.push('');
      for (const v of [...variants].sort()) {
        const refs = events.get(v) ?? [];
        lines.push(`- \`${v}\` (${refs.length} refs)`);
        for (const r of refs.slice(0, 5)) {
          lines.push(`  - ${r.kind} in \`${r.file}\``);
        }
      }
      lines.push('');
    }
  }
  lines.push('');
  lines.push('## All events (alphabetical)');
  lines.push('');
  for (const [name, refs] of [...events.entries()].sort()) {
    const emits = refs.filter((r) => r.kind === 'emit').length;
    const listens = refs.filter((r) => r.kind === 'listen').length;
    lines.push(`- \`${name}\` — ${emits} emit / ${listens} listen`);
  }
  writeMd('EVENT_TAXONOMY.md', lines.join('\n'));
}

// 5) DUPLICATION_REGISTER.md
{
  const lines = [
    '# Kloel Duplication Register',
    '',
    '> Symbols (classes, interfaces, types, functions) exported from multiple files. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    `Total cross-file duplicates: ${exactDuplicates.length}. Sorted by severity (most-duplicated first).`,
    '',
    '## Top 100 duplicated exports',
    '',
    '| Exported name | # files | Files |',
    '|---|---:|---|',
  ];
  for (const d of exactDuplicates.slice(0, 100)) {
    const sample = d.files.slice(0, 3).map((f) => `\`${f}\``).join('<br>');
    const extra = d.files.length > 3 ? `<br>… +${d.files.length - 3} more` : '';
    lines.push(`| \`${d.name}\` | ${d.files.length} | ${sample}${extra} |`);
  }
  writeMd('DUPLICATION_REGISTER.md', lines.join('\n') + '\n');
}

// 6) CANONICAL_VOCABULARY.md (starter — depends on Daniel's choices)
{
  const lines = [
    '# Kloel Canonical Vocabulary',
    '',
    '> Starter dictionary. Each row maps a canonical name to forbidden/deprecated aliases. Extend as canonicalization decisions are made.',
    '',
    '| Canonical | Aliases to migrate | Notes |',
    '|---|---|---|',
    '| `ChannelSession` | `whatsappSession`, `waSession`, `connection`, `instance`, `botSession` | Authoritative session entity across all messaging channels |',
    '| `Contact` | `Lead`, `Client`, `Customer`, `Prospect`, `User` (in messaging context) | General entity; `Lead`/`Customer` allowed only as funnel-stage labels |',
    '| `MessageDispatchService` | `WahaService.sendMessage`, `WhatsappApiService.sendText`, `MessageWorker.process` (in send role) | Single send pipeline; channel-specific adapters live below it |',
    '| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | External provider → internal event boundary |',
    '| `Workspace` | `Tenant`, `Org`, `Account` (in scope context) | The multi-tenant unit |',
    '',
    '## How to add an entry',
    '',
    '1. Find duplication: see `DUPLICATION_REGISTER.md` or `CAPABILITY_MAP.md`',
    '2. Pick the canonical name (preferred: domain-clear, no abbreviation)',
    '3. List all aliases',
    '4. Add row above',
    '5. Migration codemod can read this table to perform safe renames via `mcp__atomic-edit__atomic_rename_symbol_cross_file`',
  ];
  writeMd('CANONICAL_VOCABULARY.md', lines.join('\n') + '\n');
}

// 7) DEPRECATION_MAP.md (template)
{
  const lines = [
    '# Kloel Deprecation Map',
    '',
    '> Tracks each symbol marked as deprecated, with its replacement and migration deadline.',
    '',
    '| Deprecated symbol | Replacement | Deadline | Status |',
    '|---|---|---|---|',
    '| _(none yet — populate as canonicalization migrations land)_ | | | |',
  ];
  writeMd('DEPRECATION_MAP.md', lines.join('\n') + '\n');
}

// 8) ROUTES_CATALOG.md
{
  const byVerb = new Map();
  for (const r of routes) {
    if (!byVerb.has(r.verb)) byVerb.set(r.verb, []);
    byVerb.get(r.verb).push(r);
  }
  const lines = [
    '# Kloel Routes Catalog',
    '',
    '> Every `@Get/@Post/@Put/@Delete/@Patch` route in the backend. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    `Total routes: ${routes.length}.`,
    '',
  ];
  for (const [verb, list] of [...byVerb.entries()].sort()) {
    lines.push(`## ${verb} (${list.length})`);
    lines.push('');
    for (const r of list.sort((a, b) => (a.path || '').localeCompare(b.path || ''))) {
      lines.push(`- \`${r.path || '(root)'}\` — \`${r.file}\``);
    }
    lines.push('');
  }
  writeMd('ROUTES_CATALOG.md', lines.join('\n'));
}

// 9) QUEUES_CATALOG.md
{
  const lines = [
    '# Kloel Queues Catalog',
    '',
    '> Every BullMQ Queue() and @Processor() detected. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    `Total unique queues: ${queues.size}. Total processors: ${processors.length}.`,
    '',
    '## Queues',
    '',
  ];
  for (const [q, files] of [...queues.entries()].sort()) {
    lines.push(`### \`${q}\``);
    for (const f of [...new Set(files)]) lines.push(`- \`${f}\``);
    lines.push('');
  }
  lines.push('## Processors');
  lines.push('');
  for (const p of processors.sort((a, b) => (a.queue || '').localeCompare(b.queue || ''))) {
    lines.push(`- \`${p.name}\` → queue \`${p.queue}\` (\`${p.file}\`)`);
  }
  writeMd('QUEUES_CATALOG.md', lines.join('\n') + '\n');
}

// 10) PRISMA_USAGE.md
{
  const lines = [
    '# Kloel Prisma Model Usage',
    '',
    '> Each Prisma model with the files that read/write it. Generated by `tools/canonicalize/scan.mjs`.',
    '',
    `Total models referenced: ${prismaUsage.size}.`,
    '',
    '| Model | # files | Files (top 3) |',
    '|---|---:|---|',
  ];
  for (const [model, fileSet] of [...prismaUsage.entries()].sort((a, b) => b[1].size - a[1].size)) {
    const top = [...fileSet].slice(0, 3).map((f) => `\`${f}\``).join('<br>');
    const extra = fileSet.size > 3 ? `<br>… +${fileSet.size - 3}` : '';
    lines.push(`| \`${model}\` | ${fileSet.size} | ${top}${extra} |`);
  }
  writeMd('PRISMA_USAGE.md', lines.join('\n') + '\n');
}

// 11) ARCHITECTURE_INDEX.md (entry point)
{
  const lines = [
    '# Kloel Architecture',
    '',
    '> Generated canonical inventory of the Kloel codebase. **Read order:**',
    '',
    '1. **[CANONICAL_DOMAINS.md](./CANONICAL_DOMAINS.md)** — top-level domains and their size',
    '2. **[SERVICE_CATALOG.md](./SERVICE_CATALOG.md)** — every `@Injectable()` service per domain',
    '3. **[CAPABILITY_MAP.md](./CAPABILITY_MAP.md)** — what the system can do, grouped by capability',
    '4. **[EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md)** — every event emitted/listened, with naming variants flagged',
    '5. **[DUPLICATION_REGISTER.md](./DUPLICATION_REGISTER.md)** — same-name exports across multiple files',
    '6. **[CANONICAL_VOCABULARY.md](./CANONICAL_VOCABULARY.md)** — official names vs aliases (starter)',
    '7. **[DEPRECATION_MAP.md](./DEPRECATION_MAP.md)** — symbols marked for removal with deadlines',
    '8. **[ROUTES_CATALOG.md](./ROUTES_CATALOG.md)** — HTTP routes',
    '9. **[QUEUES_CATALOG.md](./QUEUES_CATALOG.md)** — BullMQ queues + processors',
    '10. **[PRISMA_USAGE.md](./PRISMA_USAGE.md)** — Prisma model → files that touch it',
    '',
    '## Regenerate',
    '',
    '```sh',
    'node tools/canonicalize/scan.mjs',
    '```',
    '',
    '## Operating principle',
    '',
    'These files are an **inventory**, not a target. They tell you what the codebase IS today — the canonicalization mission moves it toward what it SHOULD be:',
    '',
    '- **One canonical name** per concept (see `CANONICAL_VOCABULARY.md`)',
    '- **One canonical implementation** per capability (see `CAPABILITY_MAP.md` — pick one of each duplicated row)',
    '- **One canonical event** per occurrence (see `EVENT_TAXONOMY.md` variants section)',
    '- **One canonical service** per responsibility (see `SERVICE_CATALOG.md`)',
    '',
    'Migrations use `mcp__atomic-edit__atomic_rename_symbol_cross_file` for safe renames; deprecated aliases get tracked in `DEPRECATION_MAP.md`.',
    '',
    '## Anti-regression',
    '',
    'See `scripts/ops/check-canonical-*.mjs` (added by Phase J) for gates that:',
    '- Forbid new events without an entry in `EVENT_TAXONOMY.md`',
    '- Forbid new services duplicating a canonical capability',
    '- Forbid new entries to `CANONICAL_VOCABULARY.md` aliases column without a deprecation plan',
  ];
  writeMd('ARCHITECTURE_INDEX.md', lines.join('\n') + '\n');
}

console.log('\nDone. Output in docs/architecture/');
